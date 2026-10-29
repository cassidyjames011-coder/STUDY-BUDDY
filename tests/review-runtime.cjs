// Local workerd only; never accepts a remote target. All AI answers are synthetic.
const fs=require('fs'),assert=require('assert/strict'),base='http://127.0.0.1:8182',origin='https://studioza-ai-staging.cassidyjames011.workers.dev';
const dest=__dirname+'/../../security-remediation-review-2026-10-28/runtime-results.json';
const out={started:new Date().toISOString(),environment:'Local Cloudflare workerd + real local Durable Object SQLite, isolated persistence, public dummy Siteverify secret, mock AI only',records:[]};
const save=()=>fs.writeFileSync(dest,JSON.stringify(out,null,2));
async function request(name,path,options={}){const response=await fetch(base+path,{...options,redirect:'manual',signal:AbortSignal.timeout(20000)});const item={time:new Date().toISOString(),name,path,status:response.status,headers:Object.fromEntries(response.headers),body:(await response.text()).slice(0,16000)};out.records.push(item);save();return item;}
const payload={task:'document-sprint',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX',documentCount:2,documentMode:'mixed',documentInterests:['gardening'],documents:[{name:'Synthetic.txt',text:'STUDIOZA TEST MATERIAL — NO PERSONAL DATA. Plants use light.'}]};
const post={method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)};
(async()=>{try{
 const home=await request('homepage','/');assert.equal(home.status,200);
 const redirect=await request('privacy canonical redirect','/privacy.html');assert.equal(redirect.status,307);assert.equal(redirect.headers.location,'/privacy');
 const privacy=await request('privacy content',redirect.headers.location);assert.equal(privacy.status,200);assert.match(privacy.body,/Privacy and uploads/);
 const concurrent=await Promise.all(Array.from({length:5},(_,i)=>request('concurrent mock generation '+(i+1),'/api/generate',post)));
 assert.equal(concurrent.filter(x=>x.status===200).length,3);assert.equal(concurrent.filter(x=>x.status===429).length,2);assert.ok(concurrent.filter(x=>x.status===429).every(x=>Number(x.headers['retry-after'])>0));
 for(const [name,path,body,type,requestOrigin,status]of [['unknown path','/not-api','{}','application/json',origin,404],['missing token','/api/generate','{}','application/json',origin,400],['wrong content type','/api/generate','{}','text/plain',origin,415],['unapproved origin','/api/generate','{}','application/json','https://unapproved.invalid',403]]){const x=await request(name,path,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':type},body});assert.equal(x.status,status);}
 out.firstPhase='Pass';save();console.log('Pass: assets, privacy redirect/content, exactly 3 accepted + 2 denied concurrently, four negative cases.');
 await new Promise(resolve=>setTimeout(resolve,62000));
 const daily=await request('daily quota after rolling window','/api/generate',post);assert.equal(daily.status,429);assert.match(daily.body,/daily AI request limit/);assert.ok(Number(daily.headers['retry-after'])>60);
 out.outcome='Pass';out.finished=new Date().toISOString();save();console.log('Pass: daily cap remains enforced after rolling window.');
 }catch(e){out.outcome='Fail';out.error=e.message;out.finished=new Date().toISOString();save();console.error(e);process.exitCode=1;}})();
