const CORS={
  "Access-Control-Allow-Origin":"https://duxng000000000000000000.github.io",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, Range, X-Afterglow-Session",
  "Access-Control-Expose-Headers":"Content-Length, Content-Range, Accept-Ranges, Content-Type",
  "Vary":"Origin"
};
const SESSION_TTL_SECONDS=30*24*60*60;
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
function base64url(value){const bytes=new TextEncoder().encode(value);let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function fromBase64url(value){const base64=value.replace(/-/g,"+").replace(/_/g,"/");const padded=base64+"=".repeat((4-base64.length%4)%4);return atob(padded)}
async function sign(value,password){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));return base64url(String.fromCharCode(...new Uint8Array(signature)))}
async function createSessionToken(env){if(!env.APP_ACCESS_PASSWORD)throw new Error("APP_ACCESS_PASSWORD is missing in Worker settings.");const expires=Math.floor(Date.now()/1000)+SESSION_TTL_SECONDS;const payload=base64url(JSON.stringify({type:"afterglow-session",expires}));return payload+"."+await sign(payload,env.APP_ACCESS_PASSWORD)}
async function verifySessionToken(token,env){if(!token||!env.APP_ACCESS_PASSWORD)return false;try{const parts=token.split(".");if(parts.length!==2)return false;const payload=parts[0],supplied=parts[1],expected=await sign(payload,env.APP_ACCESS_PASSWORD);if(supplied!==expected)return false;const data=JSON.parse(fromBase64url(payload));return data.type==="afterglow-session"&&Number(data.expires)>Math.floor(Date.now()/1000)}catch{return false}}
async function verifyTurnstile(token,request,env){if(!env.TURNSTILE_SECRET)throw new Error("TURNSTILE_SECRET is missing in Worker settings.");if(!token||typeof token!=="string")throw new Error("Please complete the security verification.");const form=new FormData();form.append("secret",env.TURNSTILE_SECRET);form.append("response",token);const ip=request.headers.get("CF-Connecting-IP");if(ip)form.append("remoteip",ip);const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});const result=await response.json();if(!result.success)throw new Error("Security verification failed. Please try again.");if(result.hostname!=="duxng000000000000000000.github.io")throw new Error("Security verification hostname mismatch.");return true}
async function authorizeB2(env){if(!env.B2_KEY_ID||!env.B2_APPLICATION_KEY)throw new Error("B2 credentials are missing in Worker settings.");const credentials=btoa(env.B2_KEY_ID+":"+env.B2_APPLICATION_KEY);const response=await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account",{headers:{Authorization:"Basic "+credentials}});const auth=await response.json();if(!response.ok)throw new Error("B2 authorization failed: "+JSON.stringify(auth));if(!auth.authorizationToken||!auth.apiInfo?.storageApi?.apiUrl||!auth.apiInfo?.storageApi?.downloadUrl)throw new Error("Incomplete B2 authorization response.");return auth}
async function extractTikTokAudio(tiktokUrl){
  let primaryError="";
  try{
    const extraction=await fetch("https://api.samplecut.app/v1/downloads",{
      method:"POST",
      headers:{"Content-Type":"application/json","X-Client-Name":"Afterglow"},
      body:JSON.stringify({url:tiktokUrl,format:"mp3",response:"file"})
    });
    if(extraction.ok){
      const audioBytes=await extraction.arrayBuffer();
      if(audioBytes.byteLength)return audioBytes;
      throw new Error("The extractor returned an empty file.");
    }
    const detail=await extraction.text();
    primaryError="Audio extraction failed ("+extraction.status+"): "+detail.slice(0,400);
    let parsed=null;try{parsed=JSON.parse(detail)}catch(e){}
    const code=parsed?.error?.code;
    const message=parsed?.error?.message||detail;
    if(extraction.status!==422||code!=="extract_failed")throw new Error(primaryError);
    console.warn("Samplecut could not extract this TikTok; trying TikWM fallback:",message);
  }catch(error){
    primaryError=error?.message||"Samplecut extraction failed.";
    if(!/extract_failed|age-restricted|region-blocked|private|removed/i.test(primaryError))throw error;
  }

  try{
    const fallback=await fetch("https://www.tikwm.com/api/",{
      method:"POST",
      headers:{
        "Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
      },
      body:new URLSearchParams({url:tiktokUrl,hd:"1",web:"1"}).toString()
    });
    const data=await fallback.json();
    if(!fallback.ok||Number(data?.code)!==0||!data?.data?.music){
      throw new Error(data?.msg||"TikWM could not extract the audio.");
    }
    const musicPath=String(data.data.music);
    const musicUrl=/^https?:\/\//i.test(musicPath)?musicPath:"https://www.tikwm.com"+musicPath;
    const audioResponse=await fetch(musicUrl,{
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        "Referer":"https://www.tikwm.com/"
      }
    });
    if(!audioResponse.ok)throw new Error("TikWM audio download failed ("+audioResponse.status+").");
    const audioBytes=await audioResponse.arrayBuffer();
    if(!audioBytes.byteLength)throw new Error("TikWM returned an empty audio file.");
    return audioBytes;
  }catch(fallbackError){
    throw new Error(primaryError+"\nFallback TikWM cũng không lấy được audio: "+(fallbackError?.message||"unknown error"));
  }
}
async function uploadToB2(env,data,fileName,contentType){const auth=await authorizeB2(env);const apiUrl=auth.apiInfo.storageApi.apiUrl;const response=await fetch(apiUrl+"/b2api/v3/b2_get_upload_url",{method:"POST",headers:{Authorization:auth.authorizationToken,"Content-Type":"application/json"},body:JSON.stringify({bucketId:env.B2_BUCKET_ID})});const uploadInfo=await response.json();if(!response.ok)throw new Error("B2 upload URL error: "+JSON.stringify(uploadInfo));const sha1=await sha1Hex(data);const uploadResponse=await fetch(uploadInfo.uploadUrl,{method:"POST",headers:{Authorization:uploadInfo.authorizationToken,"X-Bz-File-Name":encodeURIComponent(fileName),"Content-Type":contentType,"X-Bz-Content-Sha1":sha1},body:data});const uploaded=await uploadResponse.json();if(!uploadResponse.ok)throw new Error("B2 upload failed: "+JSON.stringify(uploaded));return uploaded}
async function sha1Hex(buffer){const hash=await crypto.subtle.digest("SHA-1",buffer);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("")}
export default{async fetch(request,env){const url=new URL(request.url);if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});try{
if(url.pathname==="/api/health"&&request.method==="GET")return json({ok:true,service:"Afterglow API"});
if(url.pathname==="/api/import"&&request.method==="POST"){const body=await request.json();const existingSession=request.headers.get("X-Afterglow-Session")||"";const valid=await verifySessionToken(existingSession,env);let sessionToken="";if(!valid){await verifyTurnstile(body.turnstileToken,request,env);sessionToken=await createSessionToken(env)}const tiktokUrl=body.url;if(!tiktokUrl||!/^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\//i.test(tiktokUrl))return json({ok:false,error:"Please enter a valid TikTok URL."},400);
const audioBytes=await extractTikTokAudio(tiktokUrl);const fileName="afterglow/"+crypto.randomUUID()+".mp3";await uploadToB2(env,audioBytes,fileName,"audio/mpeg");return json({ok:true,sessionToken:sessionToken||undefined,file:{fileName,title:"TikTok audio",size:audioBytes.byteLength}})}
if(url.pathname==="/api/play-token"&&request.method==="POST"){const body=await request.json(),fileName=body.fileName;if(typeof fileName!=="string"||!fileName.startsWith("afterglow/")||fileName.includes("..")||!/^[a-zA-Z0-9/_-]+\.mp3$/.test(fileName))return json({ok:false,error:"Invalid audio file."},400);const expires=Math.floor(Date.now()/1000)+3600;const payload=base64url(JSON.stringify({fileName,expires}));const token=payload+"."+await sign(payload,env.APP_ACCESS_PASSWORD);return json({ok:true,url:url.origin+"/api/audio?token="+encodeURIComponent(token),expiresIn:3600})}
if(url.pathname==="/api/audio"&&request.method==="GET")return await streamAudio(request,env,url);return json({ok:false,error:"Endpoint not found."},404)}catch(error){return json({ok:false,error:error?.message||"Unexpected server error."},500)}}};
async function verifyToken(token,password){const parts=token.split(".");if(parts.length!==2)throw new Error("Invalid playback token.");const payload=parts[0],supplied=parts[1],expected=await sign(payload,password);if(supplied!==expected)throw new Error("Invalid playback signature.");const data=JSON.parse(fromBase64url(payload));if(!data.fileName||!data.fileName.startsWith("afterglow/")||data.fileName.includes(".."))throw new Error("Invalid audio file.");if(data.expires<Math.floor(Date.now()/1000))throw new Error("Playback URL expired. Please play the track again.");return data}
async function streamAudio(request,env,url){try{const token=url.searchParams.get("token");if(!token)return json({ok:false,error:"Missing playback token."},401);const data=await verifyToken(token,env.APP_ACCESS_PASSWORD);const auth=await authorizeB2(env);const apiUrl=auth.apiInfo.storageApi.apiUrl,downloadBase=auth.apiInfo.storageApi.downloadUrl;const authResponse=await fetch(apiUrl+"/b2api/v3/b2_get_download_authorization",{method:"POST",headers:{Authorization:auth.authorizationToken,"Content-Type":"application/json"},body:JSON.stringify({bucketId:env.B2_BUCKET_ID,fileNamePrefix:data.fileName,validDurationInSeconds:3600})});const downloadAuth=await authResponse.json();if(!authResponse.ok||!downloadAuth.authorizationToken)throw new Error("B2 download authorization failed: "+JSON.stringify(downloadAuth));const encodedName=data.fileName.split("/").map(part=>encodeURIComponent(part)).join("/");const downloadUrl=downloadBase+"/file/"+encodeURIComponent(env.B2_BUCKET_NAME)+"/"+encodedName;const headers=new Headers({Authorization:downloadAuth.authorizationToken});const range=request.headers.get("Range");if(range)headers.set("Range",range);const b2Response=await fetch(downloadUrl,{method:"GET",headers});if(!b2Response.ok&&b2Response.status!==206){const detail=await b2Response.text();throw new Error("B2 download failed ("+b2Response.status+"): "+detail.slice(0,300))}const responseHeaders=new Headers(CORS);responseHeaders.set("Content-Type",b2Response.headers.get("Content-Type")||"audio/mpeg");responseHeaders.set("Accept-Ranges","bytes");responseHeaders.set("Cache-Control","private, max-age=300");for(const name of ["Content-Length","Content-Range","ETag","Last-Modified"]){const value=b2Response.headers.get(name);if(value)responseHeaders.set(name,value)}return new Response(b2Response.body,{status:b2Response.status,headers:responseHeaders})}catch(error){return json({ok:false,error:error.message||"Audio streaming failed."},500)}}