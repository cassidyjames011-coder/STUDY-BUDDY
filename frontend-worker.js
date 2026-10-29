import {headersFor,serveAsset} from './worker.js';
export default{async fetch(request,env){
 const url=new URL(request.url),requestId=crypto.randomUUID();
 try{
 if(url.pathname==='/api/generate')return await env.AI_GATEWAY.fetch(request);
 if(!['GET','HEAD'].includes(request.method))return new Response('Not found.',{status:404,headers:headersFor(null,requestId)});
 return await serveAsset(request,env,requestId);
 }catch{
  console.log(JSON.stringify({event:'frontend_unavailable',requestId,status:503}));
  const headers=headersFor(null,requestId);headers.set('Content-Type','application/json; charset=utf-8');
  return new Response(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE',message:'The study service is temporarily unavailable. Your saved questions are unchanged.'},requestId}),{status:503,headers});
 }
}};
