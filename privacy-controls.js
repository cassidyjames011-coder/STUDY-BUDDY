/* REM-02: expire only app-owned storage; never clear another app's data. */
(() => {
  const keys=['exam_sprint_questions_v2','exam_sprint_weak_ids_v2','exam_sprint_reskins_v2','exam_sprint_progress_v2','exam_sprint_brain_hooks_v1','dcu_dyslexia_v2','studioza_course_title_v1','baa1118_gemini_api_key','studioza_retention_started_v1'];
  const clear=()=>keys.forEach(key=>localStorage.removeItem(key));
  try {
    const now=Date.now(), started=Number(localStorage.getItem('studioza_retention_started_v1'));
    if(!started || now-started>=30*86400000 || started>now){clear();localStorage.setItem('studioza_retention_started_v1',String(now));}
  } catch {}
  document.addEventListener('DOMContentLoaded',()=>document.getElementById('privacy-clear')?.addEventListener('click',()=>{
    if(!confirm('Clear Studioza questions, progress, interests and preferences in this browser? Provider records are unaffected.'))return;
    try{clear();location.reload();}catch{document.getElementById('privacy-clear-status').textContent='Use browser site-data settings to clear saved data.';}
  }));
})();
