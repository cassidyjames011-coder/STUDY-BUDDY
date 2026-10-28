import {headersFor} from './worker.js';
export default{async fetch(request,env){
 const url=new URL(request.url),requestId=crypto.randomUUID();
 if(url.pathname==='/api/generate')return env.AI_GATEWAY.fetch(request);
 if(!['GET','HEAD'].includes(request.method))return new Response('Not found.',{status:404,headers:headersFor(null,requestId)});
 const asset=await env.ASSETS.fetch(request),headers=headersFor(null,requestId,true);
 for(const [key,value]of asset.headers)if(['content-type','etag','last-modified'].includes(key))headers.set(key,value);
 return new Response(asset.body,{status:asset.status,headers});
}};
