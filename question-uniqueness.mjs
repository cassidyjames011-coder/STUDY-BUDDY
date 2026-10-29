// Request-local assessment validation. No student content is persisted here.
export const THRESHOLDS = Object.freeze({lexicalReject:0.90, lexicalReview:0.75, objectiveShare:0.25});
export function normalizeQuestion(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .replace(/[“”"‘’?,;:]/gu,' ').replace(/(?<=\p{L})!(?!=)/gu,' ').replace(/\.(?!\d)/gu,' ')
    .replace(/\s+/gu,' ').trim();
}
export async function hashQuestion(text) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
const synonyms = {describe:'explain',advantages:'benefits',advantage:'benefit',disadvantages:'drawbacks',define:'definition',meaning:'definition',organisation:'company',organization:'company',revenue:'sales'};
function tokens(text) {return normalizeQuestion(text).split(/[^\p{L}\p{N}_+*/=<>%-]+/u).filter(Boolean).map(t=>synonyms[t]||t);}
function jaccard(a,b) {const x=new Set(a),y=new Set(b);const intersection=[...x].filter(t=>y.has(t)).length;return intersection/(x.size+y.size-intersection||1);}
function grams(text) {const s=normalizeQuestion(text);return Array.from({length:Math.max(0,s.length-2)},(_,i)=>s.slice(i,i+3));}
export function lexicalSimilarity(a,b) {return Math.max(jaccard(tokens(a),tokens(b)),jaccard(grams(a),grams(b)));}
function opposite(a,b) {
  const x=new Set(tokens(a)),y=new Set(tokens(b));
  return [['benefits','drawbacks'],['benefit','drawback'],['increase','decrease'],['causes','consequences'],['positive','negative'],['economies','diseconomies'],['compare','contrast']].some(([p,n])=>(x.has(p)&&y.has(n)&&!x.has(n)&&!y.has(p))||(y.has(p)&&x.has(n)&&!y.has(n)&&!x.has(p)));
}
const fields=['primaryConcept','learningObjective','cognitiveSkill','assessmentAction','questionStructure','expectedAnswer','reasoning'];
export function validFingerprint(f) {
  return !!f && fields.every(k=>typeof f[k]==='string'&&f[k].trim().length>0&&f[k].length<=600) &&
    (f.scenarioType===null||typeof f.scenarioType==='string'&&f.scenarioType.length<=120) &&
    typeof f.method==='string'&&f.method.length<=120&&typeof f.formulaFamily==='string'&&f.formulaFamily.length<=120&&
    Array.isArray(f.requiredOperations)&&f.requiredOperations.length<=12&&f.requiredOperations.every(s=>typeof s==='string'&&s.length<=160);
}
export const fingerprintSchema = {type:'OBJECT',properties:Object.fromEntries([
  ...fields.map(k=>[k,{type:'STRING'}]),['scenarioType',{type:'STRING',nullable:true}],['method',{type:'STRING'}],['formulaFamily',{type:'STRING'}],['requiredOperations',{type:'ARRAY',items:{type:'STRING'}}]
]),required:[...fields,'scenarioType','method','formulaFamily','requiredOperations']};
export function summary(q,id) {
  return {id,prompt:String(q.prompt||'').slice(0,2400),code:String(q.code||'').slice(0,3000),answer:String(q.options?.[q.correct]||'').slice(0,1200),explanation:String(q.explanation||'').slice(0,2400),fingerprint:validFingerprint(q.fingerprint)?q.fingerprint:null};
}
export function isEquivalentAssessment(a,b) {
  if(!validFingerprint(a.fingerprint)||!validFingerprint(b.fingerprint)||opposite(a.prompt,b.prompt))return false;
  const x=a.fingerprint,y=b.fingerprint;
  // Broad topic equality never suffices: require objective, action, answer AND reasoning evidence.
  const actualAnswer=q=>normalizeQuestion((q.options?.[q.correct]||'')+' '+(q.explanation||'')).replace(/\d+(?:\.\d+)?/g,'#');
  return lexicalSimilarity(actualAnswer(a),actualAnswer(b))>=0.75 &&
    lexicalSimilarity(x.learningObjective,y.learningObjective)>=0.82 &&
    normalizeQuestion(x.cognitiveSkill)===normalizeQuestion(y.cognitiveSkill) &&
    lexicalSimilarity(x.assessmentAction,y.assessmentAction)>=0.8 &&
    lexicalSimilarity(x.expectedAnswer,y.expectedAnswer)>=0.8 && lexicalSimilarity(x.reasoning,y.reasoning)>=0.8;
}
export function isPracticalDuplicate(a,b) {
  if(a.questionType!=='practical'||b.questionType!=='practical'||!isEquivalentAssessment(a,b))return false;
  const x=a.fingerprint,y=b.fingerprint;
  return !!x.method&&normalizeQuestion(x.method)===normalizeQuestion(y.method)&&
    normalizeQuestion(x.questionStructure)===normalizeQuestion(y.questionStructure)&&
    x.requiredOperations.length>0&&JSON.stringify(x.requiredOperations.map(normalizeQuestion))===JSON.stringify(y.requiredOperations.map(normalizeQuestion));
}
export function createValidationContext(target,history=[]) {
  return {target,accepted:[],history:history.slice(-50),hashes:new Set(),objectives:[],started:Date.now(),metrics:{requestedQuestions:target,generatedCandidates:0,acceptedQuestions:0,rejectionBreakdown:{EXACT_DUPLICATE:0,LEXICAL_DUPLICATE:0,SEMANTIC_DUPLICATE:0,PRACTICAL_DUPLICATE:0,OBJECTIVE_OVERLAP:0,INVALID_METADATA:0},regenerationRounds:0,semanticApiCalls:0,semanticUnavailable:0,validationProcessingMs:0}};
}
export function reject(context,reason) {context.metrics.rejectionBreakdown[reason]++;return {accepted:false,reason};}
export async function validateQuestion(q,context) {
  // Code punctuation, literals and case can change the task; do not normalise them as prose.
  const key=normalizeQuestion(q.prompt)+'\n'+String(q.code||'').normalize('NFKC').trim();
  const normalizedHash=await hashQuestion(JSON.stringify([normalizeQuestion(q.prompt),String(q.code||'').normalize('NFKC').trim()]));
  if(context.hashes.has(normalizedHash))return reject(context,'EXACT_DUPLICATE');
  for(const old of [...context.history,...context.accepted]) {
    if(key===normalizeQuestion(old.prompt)+'\n'+String(old.code||'').normalize('NFKC').trim())return reject(context,'EXACT_DUPLICATE');
    if(isPracticalDuplicate(q,old))return reject(context,'PRACTICAL_DUPLICATE');
    if(isEquivalentAssessment(q,old))return reject(context,lexicalSimilarity(q.prompt,old.prompt)>=THRESHOLDS.lexicalReject?'LEXICAL_DUPLICATE':'SEMANTIC_DUPLICATE');
  }
  const objective=normalizeQuestion(q.fingerprint?.learningObjective);
  const available=new Set(context.objectives.map(normalizeQuestion));
  if(available.size>=4&&available.has(objective)&&context.accepted.filter(old=>normalizeQuestion(old.fingerprint?.learningObjective)===objective).length>=Math.ceil(context.target*THRESHOLDS.objectiveShare))return reject(context,'OBJECTIVE_OVERLAP');
  return {accepted:true,normalizedHash};
}
export function acceptQuestion(q,result,context) {
  q.normalizedHash=result.normalizedHash;context.hashes.add(result.normalizedHash);context.accepted.push(q);context.metrics.acceptedQuestions=context.accepted.length;
}
