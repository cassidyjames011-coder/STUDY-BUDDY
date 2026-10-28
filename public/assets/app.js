
    (() => {
      const state = { widgetId:null, pending:null, readyResolve:null, readyReject:null };
      const apiReady = new Promise((resolve, reject) => {
        state.readyResolve = resolve; state.readyReject = reject;
      });
      apiReady.catch(() => {});
      window.onStudyTurnstileReady = () => state.readyResolve();
      window.onStudyTurnstileLoadError = () => state.readyReject(new Error('The security check could not load. Check your connection or content blocker, then refresh and retry.'));
      function removeWidget() {
        const id = state.widgetId;
        state.widgetId = null;
        if (id !== null && window.turnstile) {
          try { window.turnstile.remove(id); } catch (error) {}
        }
      }
      function settle(error, token) {
        const pending = state.pending;
        if (!pending) return;
        state.pending = null;
        clearTimeout(pending.timeout);
        removeWidget();
        const dialog = document.getElementById('ai-security-dialog');
        if (dialog?.open) dialog.close();
        if (error) pending.reject(error); else pending.resolve(token);
      }
      window.cancelAiSecurityCheck = () => settle(new Error('Security check cancelled. Your files are still selected. Retry generation when ready.'));
      window.resetTurnstileWidget = () => {
        // A previous request finishing must not interrupt a newer verification.
        if (!state.pending) removeWidget();
      };
      async function waitForApi() {
        if (window.turnstile?.render) return;
        let timeout;
        try {
          await Promise.race([apiReady, new Promise((resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('The security check did not load. Check your connection or content blocker, then refresh and retry.')), 15000);
          })]);
        } finally { clearTimeout(timeout); }
        if (!window.turnstile?.render) throw new Error('The security check is unavailable. Refresh and retry.');
      }
      window.getTurnstileToken = () => new Promise((resolve, reject) => {
        if (state.pending) {
          reject(new Error('Another security check is already open. Finish or cancel it before retrying this action.'));
          return;
        }
        const dialog = document.getElementById('ai-security-dialog');
        if (!dialog) {
          reject(new Error('The security check could not open. Refresh and retry.'));
          return;
        }
        const pending = { resolve, reject, timeout:null };
        state.pending = pending;
        pending.timeout = setTimeout(() => settle(new Error('The security check expired. Retry generation to open a fresh check. Your files are still selected.')), 120000);
        try { dialog.showModal(); } catch (error) {
          settle(new Error('The security check could not open. Close other pop-ups and retry.')); return;
        }
        waitForApi().then(() => {
          if (state.pending !== pending) return;
          removeWidget();
          try {
            state.widgetId = window.turnstile.render('#ai-security-widget', {
              sitekey:location.hostname==='studioza-ai-staging.cassidyjames011.workers.dev'?'1x00000000000000000000AA':'0x4AAAAAAFnDFAKMEwULwt1q',
              action:'generate',
              theme:'light',
              size:window.matchMedia('(max-width:380px)').matches ? 'compact' : 'flexible',
              execution:'execute',
              appearance:'execute',
              retry:'never',
              'refresh-expired':'manual',
              'refresh-timeout':'manual',
              callback:token => {
                if (state.pending !== pending) return;
                if (typeof token === 'string' && token) settle(null, token);
                else settle(new Error('The security check returned no verification. Please retry.'));
              },
              'error-callback':code => {
                if (state.pending === pending) settle(new Error('Cloudflare could not verify this browser (' + code + '). Retry; if this continues, open the site in Chrome or Edge.'));
                return true;
              },
              'expired-callback':() => {
                if (state.pending === pending) settle(new Error('Security verification expired. Retry generation for a fresh check. Your files are still selected.'));
              },
              'timeout-callback':() => {
                if (state.pending === pending) settle(new Error('The security check expired. Retry generation to open a fresh check. Your files are still selected.'));
              },
              'unsupported-callback':() => {
                if (state.pending === pending) settle(new Error('This browser cannot run the security check. Open the site in Chrome or Edge and retry.'));
              }
            });
            window.turnstile.execute(state.widgetId);
          } catch (error) {
            settle(new Error('The security check could not start. Refresh and retry.'));
          }
        }).catch(error => {
          if (state.pending === pending) settle(error);
        });
      });
    })();
  

  

    // Starter questions will be supplied by the user.
    const QUESTION_BANK = [];

    // ========================================================================
    // STATE MANAGEMENT & ENGINE VARIABLES
    // ========================================================================
    let activeSprintSize = 50;            // Default 10Q (6m at 36s/Q)
    let activeSprintMinutes = 30;
    let isCustomSprint = false;
    let activeLectureFilter = 'all';      // 'all', 1, 2, 3, 4, 5, 'analogy', 'scenario', 'sample', 'weak', 'ai'
    let isShuffled = true;
    let appliedSprintSettings = null;
    let sprintSourceIds = null;
    let isSingleCardView = true;          // Single Card Focus vs Scrollable List
    let isInstantStudyMode = true;        // Instant Study Feedback vs Exam Simulation Mode
    let isSprintFinished = false;
    let isSprintStateReady = false;

    let activeQuestions = [];             // Array of question objects in current sprint
    let currentQIndex = 0;                // Active question index in Single Card Focus
    let userAnswers = {};                 // { [qId]: selectedOptionIndex }
    let flaggedQuestions = {};            // { [qId]: boolean }
    let timeSpentPerQuestion = {};        // { [qId]: secondsFloat }
    let savedWeakIds = {};                // Persisted in localStorage across runs

    // Timer State (36 seconds per question)
    const SECONDS_PER_QUESTION_TARGET = 36;
    const GEMINI_MODEL_ID = 'gemini-3.8-flash';
    let totalSprintSeconds = 10 * SECONDS_PER_QUESTION_TARGET;
    let remainingSprintSeconds = 10 * SECONDS_PER_QUESTION_TARGET;
    let elapsedSprintSeconds = 0;
    let isTimerPaused = true;
    let hasSprintStarted = false;

    // Audio State
    let chimesEnabled = true;
    let audioCtx = null;
    let brownNoiseNode = null;
    let brownNoiseGain = null;
    let isBrownNoisePlaying = false;

    // ========================================================================
    // INITIALIZATION
    // ========================================================================
    const aiLoadingJobs = new Map();
    function updateAiLoading(buttonId, minimum = 0) {
      const job = aiLoadingJobs.get(buttonId);
      if (!job) return;
      // Google does not report completion percentages. Keep the waiting fill below full.
      const waitingFill = job.determinate ? job.fill : 5 + 80 * (1 - Math.exp(-(Date.now() - job.started) / 30000));
      job.fill = Math.min(95, Math.max(job.fill, minimum, waitingFill));
      job.button.style.setProperty('--ai-progress', job.fill + '%');
      job.progress.style.setProperty('--ai-progress', job.fill + '%');
    }
    function startAiLoading(buttonId) {
      if (aiLoadingJobs.has(buttonId)) return;
      const button = document.getElementById(buttonId);
      const progress = document.getElementById(buttonId + '-progress');
      if (!button || !progress) return;
      const panel = button.closest('details');
      const job = { button, progress, panel, started:Date.now(), fill:0, interval:null };
      aiLoadingJobs.set(buttonId, job);
      button.disabled = true;
      button.classList.add('is-ai-loading');
      button.setAttribute('aria-busy', 'true');
      progress.hidden = false;
      progress.removeAttribute('aria-valuenow');
      progress.setAttribute('aria-valuetext', 'Working; completion time varies');
      const caption = progress.querySelector('p');
      if (caption) caption.textContent = 'Generating…';
      panel?.classList.add('ai-panel-loading');
      panel?.setAttribute('aria-busy', 'true');
      updateAiLoading(buttonId);
      job.interval = setInterval(() => updateAiLoading(buttonId), 500);
    }
    function finishAiLoading(buttonId, success) {
      const job = aiLoadingJobs.get(buttonId);
      if (!job) return;
      clearInterval(job.interval);
      aiLoadingJobs.delete(buttonId);
      job.button.setAttribute('aria-busy', 'false');
      if (![...aiLoadingJobs.values()].some(other => other.panel === job.panel)) {
        job.panel?.classList.remove('ai-panel-loading');
        job.panel?.setAttribute('aria-busy', 'false');
      }
      if (success) {
        job.button.style.setProperty('--ai-progress', '100%');
        job.progress.style.setProperty('--ai-progress', '100%');
        job.progress.setAttribute('aria-valuenow', '100');
        job.progress.setAttribute('aria-valuetext', 'Complete');
        const caption = job.progress.querySelector('p');
        if (caption) caption.textContent = 'Ready';
      }
      const reset = () => {
        if (aiLoadingJobs.has(buttonId)) return;
        job.button.classList.remove('is-ai-loading');
        job.button.style.removeProperty('--ai-progress');
        job.progress.hidden = true;
      };
      if (success) setTimeout(reset, 900); else reset();
    }

    let activeQuestionOperations = 0;
    function trackQuestionOperation(change) {
      activeQuestionOperations = Math.max(0, activeQuestionOperations + change);
      const button = document.getElementById('btn-clear-upload-history');
      if (button) {
        button.disabled = activeQuestionOperations > 0;
        button.title = activeQuestionOperations > 0 ? 'Wait for question generation to finish' : 'Clear uploaded files and AI-generated questions';
      }
    }
    function clearUploadHistory() {
      const status = document.getElementById('upload-clear-status');
      if (activeQuestionOperations > 0 || studyFileReadInProgress) { if (status) status.textContent = 'Wait for question generation to finish, then clear your uploads.'; return; }
      const generatedIds = new Set(QUESTION_BANK.filter(q => q.isAI || q.isDocumentGenerated).map(q => q.id));
      if (!selectedStudyFiles.length && !selectedStudyWebsites.length && !generatedIds.size) {
        if (status) status.textContent = 'No upload history to clear.';
        return;
      }
      if (!window.confirm('Clear uploaded files and all AI-generated questions, including their saved answers and progress? Your starter question bank, interests, and preferences will stay.')) return;
      const activeUploads = activeQuestions.some(q => generatedIds.has(q.id));
      selectedStudyFiles.length = 0;
      selectedStudyWebsites.length = 0;
      const websiteInput=document.getElementById('study-website-url');if(websiteInput)websiteInput.value='';
      sprintSourceIds = null;
      pendingDocumentQuestions = []; pendingDocumentFingerprint = '';
      const input = document.getElementById('document-upload-input');
      if (input) input.value = '';
      for (let index = QUESTION_BANK.length - 1; index >= 0; index--) {
        if (generatedIds.has(QUESTION_BANK[index].id)) QUESTION_BANK.splice(index, 1);
      }
      const keep = values => Object.fromEntries(Object.entries(values).filter(([id]) => !generatedIds.has(id)));
      userAnswers = keep(userAnswers);
      flaggedQuestions = keep(flaggedQuestions);
      timeSpentPerQuestion = keep(timeSpentPerQuestion);
      savedWeakIds = keep(savedWeakIds);
      let storageCleared = true;
      try {
        localStorage.removeItem('exam_sprint_questions_v2');
        localStorage.setItem('exam_sprint_weak_ids_v2', JSON.stringify(savedWeakIds));
        const reskins = JSON.parse(localStorage.getItem('exam_sprint_reskins_v2') || '{}');
        localStorage.setItem('exam_sprint_reskins_v2', JSON.stringify(keep(reskins)));
        if (activeUploads) localStorage.removeItem('exam_sprint_progress_v2');
      } catch (error) { storageCleared = false; }
      if (activeUploads) {
        activeLectureFilter = 'all';
        const scope = document.getElementById('scope-filter-select');
        if (scope) scope.value = 'all';
        buildSprintPool();
      }
      renderStudyFiles();
      const documentStatus = document.getElementById('document-gen-status');
      if (documentStatus) documentStatus.textContent = 'Upload files to get started.';
      setAiStatus('');
      renderAll();
      if (status) status.textContent = storageCleared ? 'Upload history cleared.' : 'Uploads cleared for this session. Browser storage could not be updated.';
    }

    function clearLegacyQuestionMemory() {
      // Retire the old bank without deleting future document questions or preferences.
      ['baa1118_ai_questions_v1', 'exam_sprint_reskins_v1', 'exam_sprint_progress_v1', 'baa1118_weak_ids_v1'].forEach(key => {
        try { localStorage.removeItem(key); } catch (error) {}
      });
    }

    function persistSprintState() {
      if (!isSprintStateReady || !activeQuestions.length) return;
      try {
        const activeIds = new Set(activeQuestions.map(q => q.id));
        const state = {
          version: 1,
          questionIds: activeQuestions.map(q => q.id),
          sprintSourceIds,
          currentQIndex,
          activeSprintSize,
          activeSprintMinutes,
          isCustomSprint,
          activeLectureFilter,
          isShuffled,
          isSingleCardView,
          isInstantStudyMode,
          userAnswers: Object.fromEntries(Object.entries(userAnswers).filter(([id]) => activeIds.has(id))),
          flaggedQuestions: Object.fromEntries(Object.entries(flaggedQuestions).filter(([id]) => activeIds.has(id))),
          timeSpentPerQuestion: Object.fromEntries(Object.entries(timeSpentPerQuestion).filter(([id]) => activeIds.has(id))),
          isSprintFinished,
          hasSprintStarted,
          totalSprintSeconds,
          remainingSprintSeconds,
          elapsedSprintSeconds
        };
        localStorage.setItem('exam_sprint_progress_v2', JSON.stringify(state));localStorage.setItem('studioza_saved_at_v1',String(Date.now()));
      } catch (e) {}
    }

    function restoreSprintState() {
      try {
        const saved = JSON.parse(localStorage.getItem('exam_sprint_progress_v2') || 'null');
        if (!saved || saved.version !== 1 || !Array.isArray(saved.questionIds) || !saved.questionIds.length) return false;
        const questionById = new Map(QUESTION_BANK.map(q => [q.id, q]));
        const restoredQuestions = saved.questionIds.map(id => questionById.get(id));
        if (restoredQuestions.some(q => !q)) return false;
        const validIds = new Set(saved.questionIds);
        activeQuestions = restoredQuestions;
        activeSprintSize = Math.min(50, Math.max(1, Number(saved.activeSprintSize) || restoredQuestions.length));
        activeSprintMinutes = Math.min(90, Math.max(1, Number(saved.activeSprintMinutes) || 6));
        isCustomSprint = !!saved.isCustomSprint;
        const allowedScopes = ['all', '1', '2', '3', '4', '5', 'analogy', 'scenario', 'sample', 'weak', 'ai'];
        const scope = String(saved.activeLectureFilter ?? 'all');
        activeLectureFilter = allowedScopes.includes(scope) && ['1', '2', '3', '4', '5'].includes(scope) ? Number(scope) : allowedScopes.includes(scope) ? scope : 'all';
        isShuffled = true;
        sprintSourceIds = Array.isArray(saved.sprintSourceIds) ? saved.sprintSourceIds.filter(id => questionById.has(id)) : null;
        isSingleCardView = true;
        isInstantStudyMode = saved.isInstantStudyMode !== false;
        currentQIndex = Math.min(restoredQuestions.length - 1, Math.max(0, Number(saved.currentQIndex) || 0));
        userAnswers = Object.fromEntries(Object.entries(saved.userAnswers || {}).filter(([id, value]) => validIds.has(id) && Number.isInteger(value) && value >= 0 && value < 4));
        flaggedQuestions = Object.fromEntries(Object.entries(saved.flaggedQuestions || {}).filter(([id, value]) => validIds.has(id) && value === true));
        timeSpentPerQuestion = Object.fromEntries(Object.entries(saved.timeSpentPerQuestion || {}).filter(([id, value]) => validIds.has(id) && Number.isFinite(value) && value >= 0));
        totalSprintSeconds = Math.min(5400, Math.max(60, Number(saved.totalSprintSeconds) || activeSprintMinutes * 60));
        const savedRemaining = Number(saved.remainingSprintSeconds);
        remainingSprintSeconds = Math.min(totalSprintSeconds, Math.max(0, Number.isFinite(savedRemaining) ? savedRemaining : totalSprintSeconds));
        elapsedSprintSeconds = Math.max(0, Number(saved.elapsedSprintSeconds) || 0);
        isSprintFinished = !!saved.isSprintFinished || remainingSprintSeconds === 0;
        hasSprintStarted = !!saved.hasSprintStarted || isSprintFinished;
        isTimerPaused = true;
        syncSprintSettingInputs();
        const scopeSelect = document.getElementById('scope-filter-select');
        const orderSelect = document.getElementById('order-select');
        const viewSelect = document.getElementById('view-select');
        if (scopeSelect) scopeSelect.value = String(activeLectureFilter);
        if (orderSelect) orderSelect.value = isShuffled ? 'shuffled' : 'sequential';
        if (viewSelect) viewSelect.value = isSingleCardView ? 'single' : 'all';
        updateFilterPills();
        return true;
      } catch (e) {
        return false;
      }
    }

    function initEngine() {
      try {
        const savedWeak = localStorage.getItem('exam_sprint_weak_ids_v2');
        if (savedWeak) savedWeakIds = JSON.parse(savedWeak);

        const savedDyslexia = localStorage.getItem('dcu_dyslexia_v2');
        if (savedDyslexia === 'true') {
          document.body.classList.add('dyslexia-mode');
          document.getElementById('label-dyslexia').textContent = 'Dyslexia: On';
        }
      } catch (e) {}

      buildSprintPool();
      renderAll();

      // Master 100ms precision timer loop for per-question pace + 1s countdown
      let tickCounter = 0;
      setInterval(() => {
        if (!isTimerPaused && !isSprintFinished && activeQuestions.length > 0) {
          const currentQ = activeQuestions[currentQIndex];
          if (currentQ) {
            timeSpentPerQuestion[currentQ.id] = (timeSpentPerQuestion[currentQ.id] || 0) + 0.1;
          }

          tickCounter++;
          if (tickCounter >= 10) {
            tickCounter = 0;
            elapsedSprintSeconds++;
            if (remainingSprintSeconds > 0) {
              remainingSprintSeconds--;
              if (remainingSprintSeconds === 0) {
                finishAndGradeSprint(true);
              }
            }
          }
          updateLiveTelemetryUI();
          if (tickCounter === 0) persistSprintState();
        }
      }, 100);

      // Keyboard navigation & answer shortcuts
      window.addEventListener('keydown', handleKeyShortcuts);
      lucide.createIcons();
    }

    function handleKeyShortcuts(e) {
  if(e.defaultPrevented||document.body.classList.contains('desk-is-open')||document.getElementById('ai-security-dialog')?.open)return;
  if(['TEXTAREA','INPUT','SELECT'].includes(document.activeElement.tagName)||e.target.closest('#study-setup,#options-menu[open],#course-picker,[role="radiogroup"]'))return;
  if(!activeQuestions.length)return;
  const key=e.key.toUpperCase(),q=activeQuestions[currentQIndex],index=['A','B','C','D'].indexOf(key);
  if(index>=0||['1','2','3','4'].includes(key)){e.preventDefault();chooseStudioAnswer(q.id,index>=0?index:Number(key)-1);}
  else if(key==='ARROWLEFT'||key==='P'){e.preventDefault();navigateQuestion(-1);}
  else if(key==='ARROWRIGHT'||key==='N'){e.preventDefault();navigateQuestion(1);}
  else if(key==='F'){e.preventDefault();toggleFlag(q.id);}
}

    // ========================================================================
    // SPRINT POOL BUILDER & FILTERS
    // ========================================================================
    function buildSprintPool() {
      let pool = QUESTION_BANK.filter(q => !sprintSourceIds || sprintSourceIds.includes(q.id));

      if (activeLectureFilter === 'sample') {
        pool = pool.filter(q => q.isSample);
      } else if (activeLectureFilter === 'analogy') {
        pool = pool.filter(q => isTheoryQuestion(q));
      } else if (activeLectureFilter === 'scenario') {
        pool = pool.filter(q => !isTheoryQuestion(q));
      } else if (activeLectureFilter === 'ai') {
        pool = pool.filter(q => q.isAI);
        if (pool.length === 0) pool = [...QUESTION_BANK];
      } else if (activeLectureFilter === 'weak') {
        pool = pool.filter(q => savedWeakIds[q.id] || flaggedQuestions[q.id]);
        if (pool.length === 0) {
          pool = [...QUESTION_BANK];
        }
      } else if (typeof activeLectureFilter === 'number') {
        pool = pool.filter(q => q.lecture === activeLectureFilter);
      }

      if (isShuffled) {
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
      }

      const count = Math.min(50, activeSprintSize, pool.length);
      activeQuestions = pool.slice(0, count);
      currentQIndex = 0;
      userAnswers = {};
      flaggedQuestions = {};
      timeSpentPerQuestion = {};
      isSprintFinished = false;
      hasSprintStarted = false;
      isTimerPaused = true;

      totalSprintSeconds = isCustomSprint ? activeSprintMinutes * 60 : count * SECONDS_PER_QUESTION_TARGET;
      remainingSprintSeconds = totalSprintSeconds;
      elapsedSprintSeconds = 0;
      if (!isCustomSprint && count > 0) activeSprintMinutes = totalSprintSeconds / 60;
      syncSprintSettingInputs();

      updateFilterPills();
    }

    function syncSprintSettingInputs() {
      document.getElementById('custom-test-minutes').value=String(Math.min(90,Math.max(1,Math.round(activeSprintMinutes))));
      document.getElementById('custom-test-questions').value=String(Math.min(50,activeSprintSize));
      const mode=document.getElementById('sprint-mode');
      mode.value=activeLectureFilter==='analogy'?'0':activeLectureFilter==='scenario'?'2':'1';
      mode.setAttribute('aria-valuetext',['Theory only','Mixed','Practical only'][Number(mode.value)]);
      appliedSprintSettings=JSON.stringify(readSprintSettings());
    }
    function readSprintSettings() {
      const minutes=Number(document.getElementById('custom-test-minutes').value);
      const questions=Number(document.getElementById('custom-test-questions').value);
      const mode=Number(document.getElementById('sprint-mode').value);
      if(!Number.isInteger(minutes)||minutes<1||minutes>90||!Number.isInteger(questions)||questions<1||questions>50) throw new Error('Choose 1–90 minutes and 1–50 questions.');
      return {minutes,questions,mode};
    }
    function setSprintMode(mode) {
      const input=document.getElementById('sprint-mode');
      if(input.disabled)return;
      input.value=String(mode);draftSettingsChanged();
    }
    function draftSettingsChanged() {
  const input=document.getElementById('sprint-mode');
  input.setAttribute('aria-valuetext',['Theory','Mixed','Practical'][Number(input.value)]);
  syncStudioMode();
  const label=document.querySelector('#btn-generate-document-sprint .ai-request-label');
  if(label&&!documentGenerationInProgress)label.textContent='Create sprint';
  document.getElementById('btn-generate-document-sprint').setAttribute('aria-label','Create a '+document.getElementById('custom-test-questions').value+' question sprint');
  syncTimerControls();
}
    function startNewSprint(size) {
      activeSprintSize=size; activeSprintMinutes=size*SECONDS_PER_QUESTION_TARGET/60; isCustomSprint=false;
      syncSprintSettingInputs(); buildSprintPool(); renderAll();
    }

    function resetCurrentSprint() {
  if((hasSprintStarted||Object.keys(userAnswers).length)&&!confirm('Restart this sprint? Your current answers and timer will reset.'))return;
  buildSprintPool();renderAll();
}

    function applyScopeFilter(value) {
      const filter = ['1','2','3','4','5'].includes(value) ? Number(value) : value;
      setLectureFilter(filter);
    }
    function setLectureFilter(filterVal) {
      activeLectureFilter = filterVal;
      if (!isCustomSprint) {
        if (typeof filterVal === 'number') activeSprintSize = 20;
        else if (filterVal === 'analogy') activeSprintSize = 40;
        else if (filterVal === 'scenario') activeSprintSize = 50;
        else if (filterVal === 'all') { activeSprintSize = 10; activeSprintMinutes = 6; }
      }
      const select = document.getElementById('scope-filter-select');
      if (select) select.value = String(filterVal);
      buildSprintPool(); renderAll();
    }
    function setOrderMode(value) {
      isShuffled = true;
      const label = document.getElementById('label-shuffle'); if (label) label.textContent = isShuffled ? 'Order: Shuffled' : 'Order: Sequential';
      buildSprintPool(); renderAll();
    }
    function setQuestionView(value) {
      isSingleCardView = true;
      const label = document.getElementById('label-layout'); if (label) label.textContent = isSingleCardView ? 'View: Single Card Focus' : 'View: All Questions List';
      renderQuestionDeck();
      persistSprintState();
    }
    function toggleShuffleOrder() {
      isShuffled = true;
      document.getElementById('label-shuffle').textContent = isShuffled ? 'Order: Shuffled' : 'Order: Sequential';
      buildSprintPool();
      renderAll();
    }

    function toggleViewLayout() {
      isSingleCardView = true;
      document.getElementById('label-layout').textContent = isSingleCardView ? 'View: Single Card Focus' : 'View: All Questions List';
      renderQuestionDeck();
    }

    function toggleFeedbackMode() {
      isInstantStudyMode = !isInstantStudyMode;
      const label = document.getElementById('label-feedback-mode');
      const btn = document.getElementById('btn-feedback-mode');
      if (isInstantStudyMode) {
        label.textContent = 'Mode: Instant Study';
        btn.className = 'px-2.5 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-xs font-bold flex items-center gap-1.5 text-indigo-300 transition';
      } else {
        label.textContent = 'Mode: Exam Simulation';
        btn.className = 'px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 text-amber-300 transition';
      }
      renderAll();
    }

    function updateFilterPills() {
      const scopeSelect = document.getElementById('scope-filter-select');
      if (scopeSelect) scopeSelect.options[0].textContent = 'All questions (' + QUESTION_BANK.length + ')';
      const keys = ['all', 1, 2, 3, 4, 5, 'analogy', 'scenario', 'sample', 'weak', 'ai'];
      keys.forEach(k => {
        const el = document.getElementById(`flt-${k}`);
        if (!el) return;
        if (k === activeLectureFilter) {
          el.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-500 text-slate-950 transition shadow';
        } else if (k === 'analogy') {
          const analogyCount = QUESTION_BANK.filter(q => isTheoryQuestion(q)).length;
          el.textContent = `⛳🏉✈️ Theory Mediums (${analogyCount})`;
          el.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition';
        } else if (k === 'scenario') {
          const scenarioCount = QUESTION_BANK.filter(q => !isTheoryQuestion(q)).length;
          el.textContent = `💻 Code Scenarios (${scenarioCount})`;
          el.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30 transition';
        } else if (k === 'sample') {
          el.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition';
        } else if (k === 'weak') {
          const weakCount = Object.keys(savedWeakIds).length;
          el.textContent = `Missed / Flagged (${weakCount})`;
          el.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition';
        } else if (k === 'ai') {
          const aiCount = QUESTION_BANK.filter(q => q.isAI).length;
          el.textContent = `AI Generated (${aiCount})`;
          el.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition';
        } else {
          el.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white transition';
        }
      });
    }

    // ========================================================================
    // USER INTERACTIONS: ANSWERING, FLAGGING, NAVIGATION & FINISHING
    // ========================================================================
    function selectOption(qId, optionIdx) {
      if (isSprintFinished) return;
      userAnswers[qId] = optionIdx;

      const qObj = QUESTION_BANK.find(q => q.id === qId);
      if (qObj) {
        if (optionIdx !== qObj.correct) {
          savedWeakIds[qId] = true;
          if (isInstantStudyMode) playHarmonicChime('wrong');
        } else {
          if (isInstantStudyMode) playHarmonicChime('task');
        }
        persistWeakIds();
      }

      updateLiveTelemetryUI();
      updateFilterPills();
      renderQuestionNavGrid();
      renderQuestionDeck();
      renderLectureBreakdown();
      focusActiveQuestion();
      persistSprintState();
    }

    function toggleFlag(qId) {
      flaggedQuestions[qId] = !flaggedQuestions[qId];
      if (flaggedQuestions[qId]) {
        savedWeakIds[qId] = true;
      }
      persistWeakIds();
      updateLiveTelemetryUI();
      updateFilterPills();
      renderQuestionNavGrid();
      renderQuestionDeck();
      persistSprintState();
    }

    function persistWeakIds() {
      try {
        localStorage.setItem('exam_sprint_weak_ids_v2', JSON.stringify(savedWeakIds));
      } catch (e) {}
    }

    function clearSavedWeakHistory() {
      savedWeakIds = {};
      persistWeakIds();
      updateFilterPills();
    }

    function jumpToQuestion(idx) {
      if (idx < 0 || idx >= activeQuestions.length) return;
      currentQIndex = idx;
      persistSprintState();
      renderQuestionNavGrid();
      if (isSingleCardView) {
        renderQuestionDeck();
        focusActiveQuestion();
      } else {
        const cardEl = document.getElementById(`q-card-${activeQuestions[idx].id}`);
        if (cardEl) cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function navigateQuestion(delta) {
      const nextIdx = currentQIndex + delta;
      if (nextIdx >= 0 && nextIdx < activeQuestions.length) {
        currentQIndex = nextIdx;
        persistSprintState();
        renderQuestionNavGrid();
        renderQuestionDeck();
        focusActiveQuestion();
      }
    }

    function finishAndGradeSprint(autoTriggeredByTimer = false) {
  if(!activeQuestions.length||isSprintFinished)return;
  const dialog=document.getElementById('finish-sprint-dialog');
  if(autoTriggeredByTimer!==true){
    const answered=activeQuestions.filter(q=>userAnswers[q.id]!==undefined).length;
    document.getElementById('finish-dialog-copy').textContent='You’ve answered '+answered+' of '+activeQuestions.length+' questions. '+(answered<activeQuestions.length?'Unanswered questions will not be scored. ':'')+'You can review the explanations afterwards.';
    dialog.showModal();return;
  }
  if(dialog.open)dialog.close();
  isSprintFinished=true;isTimerPaused=true;
  syncTimerControls();playHarmonicChime('complete');renderAll();
  document.getElementById('sprint-completion-summary').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}
    function confirmFinishSprint(){finishAndGradeSprint(true);}


    // ========================================================================
    // TIMER & LIVE TELEMETRY UPDATES
    // ========================================================================
    function formatMinSec(totalSeconds) {
      const s = Math.max(0, Math.floor(totalSeconds));
      const mins = Math.floor(s / 60);
      const secs = s % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function readSprintSettingsSafe(){try{return readSprintSettings();}catch(error){return null;}}
    function syncTimerControls() {
      const button = document.getElementById('btn-pause-timer');
      const label = document.getElementById('label-pause-timer');
      const icon = document.getElementById('icon-pause-timer');
      const status = document.getElementById('timer-status-sub');
      const finishButton = document.getElementById('btn-finish-sprint');
      if (finishButton) finishButton.classList.toggle('hidden', !hasSprintStarted || isSprintFinished);
      if (label) label.textContent = documentGenerationInProgress ? 'Creating…' : !hasSprintStarted || isSprintFinished || JSON.stringify(readSprintSettingsSafe())!==appliedSprintSettings ? 'Start' : isTimerPaused ? 'Resume' : 'Pause';
      if (button) {
        button.disabled = !QUESTION_BANK.length || documentGenerationInProgress;
        button.setAttribute('aria-label', label?.textContent || 'Start');
        button.classList.toggle('opacity-60', button.disabled);
      }
      if (icon) icon.setAttribute('data-lucide', isTimerPaused || isSprintFinished ? 'play' : 'pause');
      if (status) status.textContent = !activeQuestions.length ? 'Add material to begin' : isSprintFinished ? 'Sprint complete' : !hasSprintStarted ? 'Ready when you are' : isTimerPaused ? 'Paused · Progress saved' : 'Your sprint is in progress';
      if (window.lucide) lucide.createIcons();
      ['custom-test-minutes','custom-test-questions','sprint-mode'].forEach(id=>{document.getElementById(id).disabled=!isTimerPaused||documentGenerationInProgress;});
      syncStudioMode();
      persistSprintState();
    }

    function togglePauseTimer() {
      if(documentGenerationInProgress)return;
      if(!isTimerPaused){isTimerPaused=true;syncTimerControls();return;}
      let settings;
      try{settings=readSprintSettings();}catch(error){alert(error.message);return;}
      const changed=JSON.stringify(settings)!==appliedSprintSettings;
      if(!hasSprintStarted||changed||isSprintFinished) {
        const scope=['analogy','all','scenario'][settings.mode];
        const pool=QUESTION_BANK.filter(q=>(!sprintSourceIds||sprintSourceIds.includes(q.id))&&(scope==='all'||(scope==='analogy'?isTheoryQuestion(q):!isTheoryQuestion(q))));
        if(!pool.length){alert('No questions of this type are available. Choose another type or use AI Generator.');return;}
        if(Object.keys(userAnswers).length&&!confirm('Start a new sprint with these settings? This resets the current sprint answers; your question bank stays saved.'))return;
        activeSprintMinutes=settings.minutes;activeSprintSize=settings.questions;activeLectureFilter=scope;
        isCustomSprint=true;isShuffled=true;isSingleCardView=true;
        buildSprintPool();renderAll();
      }
      if(!activeQuestions.length)return;
      hasSprintStarted=true;isTimerPaused=false;syncTimerControls();
    }

    function addExtraMinute() {
      remainingSprintSeconds += 60;
      totalSprintSeconds += 60;
      updateLiveTelemetryUI();
    }

    function getPaceTargetSeconds() { return activeQuestions.length > 0 ? totalSprintSeconds / activeQuestions.length : SECONDS_PER_QUESTION_TARGET; }

    function updateLiveTelemetryUI() {
  const answered=activeQuestions.filter(q=>userAnswers[q.id]!==undefined).length;
  const correct=activeQuestions.filter(q=>userAnswers[q.id]===q.correct).length;
  const grading=isInstantStudyMode||isSprintFinished;
  const percent=totalSprintSeconds?Math.max(0,Math.min(100,remainingSprintSeconds/totalSprintSeconds*100)):0;
  document.getElementById('metric-time-remaining').textContent=formatMinSec(remainingSprintSeconds);
  document.getElementById('metric-time-elapsed-label').textContent=formatMinSec(elapsedSprintSeconds)+' elapsed';
  document.getElementById('bar-timer-remaining').style.width=percent+'%';
  document.getElementById('timer-progress').setAttribute('aria-valuenow',String(Math.round(percent)));
  document.getElementById('metric-accuracy-pct').textContent=grading?(answered?Math.round(correct/answered*100)+'%':'—'):'Hidden';
  document.getElementById('metric-score-fraction').textContent=grading?correct+' / '+answered+' correct':'Shown when you finish';
  document.getElementById('score-mode-subtitle').textContent=grading?'Answer feedback is visible':'Answers are hidden until the sprint ends';
  document.getElementById('label-answered-count').textContent=answered+' / '+activeQuestions.length;
  const target=getPaceTargetSeconds();
  document.getElementById('label-pace-target').textContent=activeQuestions.length?Math.round(target)+'s / Q':'—';
  const average=answered?elapsedSprintSeconds/answered:0;
  const pace=document.getElementById('badge-pace-status');
  pace.textContent=!hasSprintStarted?'Start when you’re ready':!answered?'Finding your pace':average<=target*1.03?'On pace':Math.round(average-target)+'s over target per question';
  const flagged=Object.values(flaggedQuestions).filter(Boolean).length;
  const flagLabel=document.getElementById('badge-flagged-count');flagLabel.hidden=!flagged;flagLabel.textContent=flagged+' flagged for review';
  const summary=document.getElementById('sprint-completion-summary');summary.hidden=!isSprintFinished;
  if(isSprintFinished)document.getElementById('sprint-completion-copy').textContent='You completed '+answered+' of '+activeQuestions.length+' questions, with '+correct+' correct. '+(activeQuestions.length-answered?'Unanswered questions were not scored. ':'')+'Review the explanations at your own pace.';
  syncStudioHeader();
}

    // ========================================================================
    // RENDERERS: NAV GRID, LECTURE BREAKDOWN, QUESTION CARDS & EXPORT TABLE
    // ========================================================================
    function renderAll() {
      updateLiveTelemetryUI();
      renderQuestionNavGrid();
      renderLectureBreakdown();
      renderQuestionDeck();
      syncTimerControls();
      updateBrainHookUI();
      renderStudioDeskContext();

      lucide.createIcons();
    }

    function renderQuestionNavGrid() {
  const grid=document.getElementById('question-nav-grid');if(!grid)return;
  const grading=isInstantStudyMode||isSprintFinished;
  grid.innerHTML=activeQuestions.map((q,index)=>{
    const answered=userAnswers[q.id]!==undefined,flagged=!!flaggedQuestions[q.id],current=index===currentQIndex;
    let state=answered?(grading?(userAnswers[q.id]===q.correct?'correct':'incorrect'):'completed'):'';
    if(flagged)state+=' flagged';
    const status=(answered?(grading?userAnswers[q.id]===q.correct?'correct':'incorrect':'completed'):'unanswered')+(flagged?', flagged for review':'');
    return `<button type="button" class="map-question ${state} ${current?'current':''}" data-question-index="${index}" data-onclick="h40" ${current?'aria-current="step"':''} aria-label="Question ${index+1}, ${status}" title="Question ${index+1} · ${status}">${index+1}${flagged?'<span class="map-flag" aria-hidden="true">•</span>':''}</button>`;
  }).join('')||'<p class="status-meta" style="grid-column:1 / -1">Your question map will appear here.</p>';
}

    function renderLectureBreakdown() {
      const container = document.getElementById('source-mini-bars');
      if (!container) return;
      const showGrading = isInstantStudyMode || isSprintFinished;
      const groups = new Map();
      activeQuestions.forEach(q => {
        const source = q.sourceDoc || (q.isAI ? 'Personalised question bank' : 'Built-in question bank');
        if (!groups.has(source)) groups.set(source, []);
        groups.get(source).push(q);
      });
      container.innerHTML = [...groups.entries()].map(([source, questions]) => {
        const answered = questions.filter(q => userAnswers[q.id] !== undefined);
        const correct = answered.filter(q => userAnswers[q.id] === q.correct);
        const pct = answered.length ? Math.round(correct.length / answered.length * 100) : 0;
        const rightText = showGrading
          ? (answered.length ? `${correct.length}/${answered.length} · ${pct}%` : `0/${questions.length}`)
          : `${answered.length}/${questions.length} answered`;
        const barWidth = showGrading ? pct : (questions.length ? answered.length / questions.length * 100 : 0);
        const barColor = !showGrading ? 'bg-sky-400' : pct >= 75 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-500';
        return `<div>
          <div class="flex justify-between gap-2 text-[11px] font-mono"><span class="min-w-0 truncate text-slate-300" title="${escapeHtml(source)}">${escapeHtml(source)}</span><span class="shrink-0 text-slate-400">${rightText}</span></div>
          <div class="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800"><div class="h-full ${barColor} transition-all duration-300" style="width:${barWidth}%"></div></div>
        </div>`;
      }).join('') || '<p class="text-xs text-slate-500">Your question sources will appear here.</p>';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function isTheoryQuestion(q) {
      if(q.questionType === 'theory') return true;
      if(q.questionType === 'practical') return false;
      return q.isAnalogyTheory === true;
    }

    function getFormatBadgeHTML(q) {
      const theory=isTheoryQuestion(q);
      return '<span class="px-2.5 py-1 rounded-lg text-xs font-bold border '+
        (theory?'bg-emerald-500/20 text-emerald-300 border-emerald-500/40':'bg-sky-500/20 text-sky-300 border-sky-500/40')+'">'+
        (theory?'Theory':'Practical')+'</span>';
    }

    function buildSingleQuestionCardHTML(q, idx) {
  const answer=userAnswers[q.id],answered=answer!==undefined,feedback=isInstantStudyMode&&answered||isSprintFinished;
  const flagged=!!flaggedQuestions[q.id],letters=['A','B','C','D'];
  const options=q.options.map((text,index)=>{
    const selected=answer===index,correct=index===q.correct;
    const state=feedback&&correct?'correct':feedback&&selected?'incorrect':selected?'selected':'';
    const label=feedback&&correct?'✓ Correct':feedback&&selected?(isSprintFinished?'✕ Your answer':'✕ Try again · Your answer'):selected?'Selected':'';
    return `<button type="button" id="answer-${idx}-${index}" role="radio" aria-checked="${selected}" aria-disabled="${isSprintFinished}" tabindex="${answered?selected?'0':'-1':index===0?'0':'-1'}" data-question-id="${escapeHtml(q.id)}" data-answer-index="${index}" data-onclick="h41" data-onkeydown="h42" class="answer-option ${state}">
      <span class="answer-letter" aria-hidden="true">${letters[index]}</span><span class="answer-copy"><span class="sr-only">${letters[index]}. </span>${escapeHtml(text)}${label?`<span class="answer-feedback">${label}</span>`:''}</span>
    </button>`;
  }).join('');
  const explanation=feedback?`<section class="question-explanation ${answer===q.correct?'':'is-incorrect'}" aria-label="Answer explanation"><h4>${isSprintFinished?'Answer explained':answer===q.correct?'Correct — here’s why':'The reasoning · Correct answer '+letters[q.correct]}</h4><p>${escapeHtml(q.explanation)}</p></section>`:'';
  const code=q.code?`<div class="question-code"><div>Code reference</div><pre><code>${escapeHtml(q.code)}</code></pre></div>`:'';
  return `<article id="q-card-${escapeHtml(q.id)}" class="question-card">
    <div class="question-scroll" aria-label="Question and answers"><div class="question-meta">Question ${String(idx+1).padStart(2,'0')} · ${isTheoryQuestion(q)?'Theory':'Practical'}</div>
    <p class="question-source"><strong>${escapeHtml(q.sourceDoc||'Saved study material')}</strong>${q.topic?' · '+escapeHtml(q.topic):''}</p>
    <h3 id="active-question-heading" tabindex="-1" class="question-prompt">${escapeHtml(q.prompt)}</h3>
    <p class="answer-hint">Choose the answer that fits best.</p>${code}
    <div class="answer-list" role="radiogroup" aria-label="Answer choices">${options}</div>${explanation}
    </div><div class="question-footer">
      <button type="button" class="flag-action ${flagged?'is-flagged':''}" aria-pressed="${flagged}" data-question-id="${escapeHtml(q.id)}" data-onclick="h43"><i data-lucide="flag" aria-hidden="true"></i>${flagged?'Flagged for review':'Flag for review'}</button>
      <button type="button" class="question-previous" data-onclick="h44" ${idx===0?'disabled':''} aria-label="Previous question"><i data-lucide="arrow-left" aria-hidden="true"></i><span>Previous</span></button>
      ${idx<activeQuestions.length-1?'<button type="button" class="question-next" data-onclick="h45">Next question <span aria-hidden="true">→</span></button>':'<button type="button" class="question-next" data-onclick="h38">Finish sprint <span aria-hidden="true">✓</span></button>'}
    </div>
  </article>`;
}

    function renderQuestionDeck() {
  const container=document.getElementById('question-deck-container');if(!container)return;
  const oldQuestion=container.dataset.questionId;
  const oldScroll=container.querySelector('.question-scroll')?.scrollTop||0;
  if(!activeQuestions.length){
    container.innerHTML=`<div class="question-card question-empty"><span class="eyebrow">Your study workspace</span><h2>A fresh start for your next sprint.</h2><p>${QUESTION_BANK.length?'Choose your question mix or a different saved source to continue.':'Bring your notes, add what interests you, and make the material your own.'}</p><div class="empty-step"><span>1</span>Add your source material</div><div class="empty-step"><span>2</span>Choose interests and a question mix</div><div class="empty-step"><span>3</span>Create a focused sprint</div><button type="button" class="button-primary" data-onclick="h19">Add source materials</button></div>`;
  }else container.innerHTML=buildSingleQuestionCardHTML(activeQuestions[currentQIndex],currentQIndex);
  const newQuestion=activeQuestions[currentQIndex]?.id||'';
  container.dataset.questionId=newQuestion;
  const scroll=container.querySelector('.question-scroll');if(scroll)scroll.scrollTop=oldQuestion===newQuestion?oldScroll:0;
  scheduleStudioFit();
  syncStudioHeader();
  if(window.lucide)lucide.createIcons();
}

    // ========================================================================
    // WEB AUDIO API (HARMONIC CHIMES & BROWN NOISE) + DYSLEXIA MODE
    // ========================================================================
    function ensureAudioContext() {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    }

    function playHarmonicChime(type = 'task') {
      if (!chimesEnabled) return;
      try {
        ensureAudioContext();
        const now = audioCtx.currentTime;
        const notes = type === 'complete'
          ? [523.25, 659.25, 783.99, 1046.50]
          : type === 'wrong'
          ? [311.13, 277.18]
          : [587.33, 880.00];

        notes.forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);

          gain.gain.setValueAtTime(0.001, now + idx * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.1, now + idx * 0.1 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.65);

          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.7);
        });
      } catch (e) {}
    }

    function toggleChimes() {
      chimesEnabled = !chimesEnabled;
      document.getElementById('label-chime').textContent = chimesEnabled ? 'Chimes On' : 'Chimes Muted';
      if (chimesEnabled) playHarmonicChime('task');
    }

    function toggleBrownNoise() {
      ensureAudioContext();
      const labelEl = document.getElementById('label-noise');
      const btnEl = document.getElementById('btn-noise-toggle');

      if (isBrownNoisePlaying) {
        if (brownNoiseNode) {
          brownNoiseNode.disconnect();
          brownNoiseNode = null;
        }
        isBrownNoisePlaying = false;
        labelEl.textContent = 'Focus Noise: Off';
        btnEl.classList.remove('ring-1', 'ring-amber-400');
      } else {
        const bufferSize = 2 * audioCtx.sampleRate;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          output[i] = (lastOut + (0.02 * white)) / 1.02;
          lastOut = output[i];
          output[i] *= 0.18;
        }

        brownNoiseNode = audioCtx.createBufferSource();
        brownNoiseNode.buffer = noiseBuffer;
        brownNoiseNode.loop = true;

        brownNoiseGain = audioCtx.createGain();
        brownNoiseGain.gain.setValueAtTime(0.15, audioCtx.currentTime);

        brownNoiseNode.connect(brownNoiseGain);
        brownNoiseGain.connect(audioCtx.destination);
        brownNoiseNode.start(0);

        isBrownNoisePlaying = true;
        labelEl.textContent = 'Focus Noise: ON';
        btnEl.classList.add('ring-1', 'ring-amber-400');
      }
    }

    function toggleDyslexiaMode() {
      const isOn = document.body.classList.toggle('dyslexia-mode');
      document.getElementById('label-dyslexia').textContent = isOn ? 'Dyslexia: On' : 'Dyslexia Mode';
      try {
        localStorage.setItem('dcu_dyslexia_v2', String(isOn));
      } catch (e) {}
    }

    // ========================================================================
    // PERSONALISATION + OPTIONAL GEMINI LOCAL BETA
    // ========================================================================
    let selectedBrainHooks = [];
    const BRAIN_HOOK_GROUPS = {
      'Sports': ['Soccer', 'Rugby', 'Golf', 'Formula 1'],
      'Hobbies': ['Painting', 'Gaming', 'MMA'],
      'Other interests': ['Planes', 'Ships', 'Trains']
    };
    const selectedStudyFiles = [];
    const selectedStudyWebsites = [];
    const studyFileTextCache = new WeakMap();
    let studyFileReadInProgress = false;
    let pendingDocumentQuestions = [];
    let pendingDocumentFingerprint = '';
    function validDocumentQuestion(q, sources) {
  return q && sources.includes(q.sourceDoc) && ["practical","theory"].includes(q.questionType) &&
    typeof q.topic === "string" && q.topic.trim() && typeof q.prompt === "string" && q.prompt.trim() &&
    (q.code === undefined || q.code === null || typeof q.code === "string") &&
    Array.isArray(q.options) && q.options.length === 4 && q.options.every(option => typeof option === "string" && option.trim()) &&
    new Set(q.options.map(option => option.trim().toLowerCase())).size === 4 &&
    Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4 &&
    typeof q.explanation === "string" && q.explanation.trim();
}


    function documentQuestionKey(q) {
      return (q.prompt + '\n' + (q.code || '')).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    const MAX_STUDY_FILES = 10;
    const MAX_STUDY_BYTES = 8 * 1024 * 1024;
    function studyFileType(file) {
      const name = file.name.toLowerCase();
      if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'application/pdf';
      if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (name.endsWith('.json')) return 'application/json';
      if (file.type === 'text/plain' || name.endsWith('.txt')) return 'text/plain';
      if (file.type === 'text/markdown' || name.endsWith('.md') || name.endsWith('.markdown')) return 'text/markdown';
      return '';
    }

    function addStudyWebsite() {
      document.getElementById('document-gen-status').textContent='Website imports are temporarily unavailable. Upload a PDF or text copy.';return;

      const status=document.getElementById('document-gen-status');
      if(documentGenerationInProgress)return;
      const input=document.getElementById('study-website-url');
      try {
        let value=input.value.trim();
        if(!value)throw new Error('Paste a website URL first.');
        if(!/^[a-z][a-z0-9+.-]*:/i.test(value))value='https://'+value;
        const url=new URL(value);url.hash='';
        if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!url.hostname.includes('.')||url.hostname.includes(':')||/^\d+(?:\.\d+)*$/.test(url.hostname)||/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)\.?$/.test(url.hostname)||url.href.length>512)throw new Error('Use a public HTTPS website URL, without sign-in details.');
        if(selectedStudyWebsites.includes(url.href)){status.textContent='That website is already added.';return;}
        if(selectedStudyFiles.length+selectedStudyWebsites.length>=MAX_STUDY_FILES)throw new Error('You can add up to 10 sources in total.');
        if(selectedStudyFiles.some(file=>file.name===url.href))throw new Error('That source name is already in use.');
        selectedStudyWebsites.push(url.href);
        pendingDocumentQuestions=[];pendingDocumentFingerprint='';
        input.value='';renderStudyFiles();
        status.textContent='Website added. It will be read when you select Create.';
      } catch(error){status.textContent=error.message||'Enter a valid website URL.';}
    }

    function removeStudyWebsite(index) {
      if(documentGenerationInProgress)return;
      selectedStudyWebsites.splice(index,1);
      pendingDocumentQuestions=[];pendingDocumentFingerprint='';
      renderStudyFiles();
      document.getElementById('document-gen-status').textContent='Website removed.';
    }

    function decodeSourceEntities(text) {
      const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
      return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(match,value)=>{
        if(value[0]!=='#')return entities[value.toLowerCase()]||match;
        const code=value[1].toLowerCase()==='x'?parseInt(value.slice(2),16):parseInt(value.slice(1),10);
        return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):' ';
      });
    }

    async function extractDocxText(buffer) {
      const view=new DataView(buffer),bytes=new Uint8Array(buffer);
      const invalid=()=>new Error('This Word file could not be read. Save it as a fresh .docx or PDF and try again.');
      let end=-1;
      for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){
        if(view.getUint32(p,true)===0x06054b50 && p+22+view.getUint16(p+20,true)===bytes.length){end=p;break;}
      }
      if(end<0)throw invalid();
      const count=view.getUint16(end+10,true),directory=view.getUint32(end+16,true);
      if(count===65535||count>10000||view.getUint16(end+4,true)||view.getUint16(end+6,true)||directory>=end)throw invalid();
      let pos=directory,entry=null,total=0;
      for(let i=0;i<count;i++){
        if(pos+46>end||view.getUint32(pos,true)!==0x02014b50)throw invalid();
        const nameLength=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
        if(pos+46+nameLength+extra+comment>end)throw invalid();
        const size=view.getUint32(pos+24,true);total+=size;
        if(total>32*1024*1024)throw new Error('This Word file expands beyond the safe reading limit. Export its text as PDF or TXT.');
        const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+nameLength));
        if(name==='word/document.xml')entry={flags:view.getUint16(pos+8,true),method:view.getUint16(pos+10,true),compressed:view.getUint32(pos+20,true),size,offset:view.getUint32(pos+42,true)};
        pos+=46+nameLength+extra+comment;
      }
      if(!entry||entry.flags&1||entry.size>2*1024*1024||entry.offset+30>directory)throw invalid();
      const offset=entry.offset;
      if(view.getUint32(offset,true)!==0x04034b50)throw invalid();
      const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);
      if(start+entry.compressed>directory)throw invalid();
      const compressed=bytes.subarray(start,start+entry.compressed);
      let xmlBytes;
      if(entry.method===0)xmlBytes=compressed;
      else if(entry.method===8) {
        if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot read Word files. Please upload a PDF or TXT version.');
        let decoder;
        try{decoder=new DecompressionStream('deflate-raw');}catch(error){throw new Error('This browser cannot read Word files. Please upload a PDF or TXT version.');}
        const reader=new Blob([compressed]).stream().pipeThrough(decoder).getReader();
        const chunks=[];let length=0;
        try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>entry.size||length>2*1024*1024)throw invalid();chunks.push(part.value);}}
        finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        xmlBytes=new Uint8Array(length);let at=0;for(const chunk of chunks){xmlBytes.set(chunk,at);at+=chunk.length;}
      } else throw invalid();
      if(xmlBytes.length!==entry.size)throw invalid();
      const xml=new TextDecoder('utf-8',{fatal:true}).decode(xmlBytes);
      if(!/<(?:\w+:)?document\b/.test(xml)||/<!DOCTYPE|<!ENTITY/i.test(xml))throw invalid();
      const text=decodeSourceEntities(xml.replace(/<!--[^]*?-->/g,'').replace(/<(?:\w+:)?(?:tab|br|cr)\b[^>]*\/?\s*>/g,'\n').replace(/<\/(?:\w+:)?(?:p|tr)\s*>/g,'\n').replace(/<\/(?:\w+:)?tc\s*>/g,'\t').replace(/<[^>]*>/g,'')).replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
      if(!text)throw new Error('No readable text was found in this Word file. Try a text-based PDF or TXT file.');
      return text;
    }

    async function handleStudyFiles(fileList) {
      const status = document.getElementById('document-gen-status');
      if (documentGenerationInProgress || studyFileReadInProgress) { if (status) status.textContent = 'Please wait while your sources are being read.'; return; }
      const incoming = Array.from(fileList || []);
      let added = 0;
      studyFileReadInProgress = true; renderStudyFiles();
      try {
      for (const file of incoming) {
        const mime = studyFileType(file);
        if(mime==='application/pdf'){
          const head=new TextDecoder().decode(await file.slice(0,8).arrayBuffer());
          const tail=new TextDecoder().decode(await file.slice(Math.max(0,file.size-1024)).arrayBuffer());
          if(file.size<20||!/^%PDF-(?:1\.[0-7]|2\.0)/.test(head)||!tail.includes('%%EOF')){if(status)status.textContent='This file is not a readable PDF. Export a fresh PDF or use Word/TXT.';continue;}
        }
        if (!mime) { if (status) status.textContent = 'Use PDF, Word (.docx), TXT, Markdown, or JSON files. Unsupported files were skipped.'; continue; }
        if (selectedStudyFiles.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) continue;
        if (selectedStudyFiles.length + selectedStudyWebsites.length >= MAX_STUDY_FILES) { if (status) status.textContent = 'You can add up to 10 sources in total.'; break; }
        const currentSize = selectedStudyFiles.reduce((sum, item) => sum + item.size, 0);
        if (currentSize + file.size > MAX_STUDY_BYTES) { if (status) status.textContent = 'The total upload limit is 8 MB. Remove a file or choose smaller files.'; continue; }
        if(selectedStudyFiles.some(existing=>existing.name===file.name)||selectedStudyWebsites.includes(file.name)){if(status)status.textContent='Use a different name for files with the same name.';continue;}
        if(mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
          if(status)status.textContent='Reading '+file.name+'…';
          try{studyFileTextCache.set(file,await extractDocxText(await file.arrayBuffer()));}
          catch(error){if(status)status.textContent=file.name+': '+(error.message||'This Word file could not be read. Save as PDF and retry.');continue;}
        }
        selectedStudyFiles.push(file); added++;
      }
      } finally {studyFileReadInProgress=false;}
      const picker = document.getElementById('document-upload-input'); if (picker) picker.value = '';
      renderStudyFiles();
      if (status && added) status.textContent = `${selectedStudyFiles.length+selectedStudyWebsites.length} source${selectedStudyFiles.length+selectedStudyWebsites.length === 1 ? '' : 's'} ready. They’ll be sent with your interests when you select Create.`;
    }
    function removeStudyFile(index) {
      if (documentGenerationInProgress) return;
      pendingDocumentQuestions = []; pendingDocumentFingerprint = '';
      selectedStudyFiles.splice(index, 1);
      renderStudyFiles();
      const status = document.getElementById('document-gen-status');
      if (status) status.textContent = selectedStudyFiles.length ? 'Document removed. Your remaining files are ready.' : 'Upload notes or questions to get started.';
    }
    function renderStudyFiles() {
      const busy=documentGenerationInProgress||studyFileReadInProgress;
      const uploadButton=document.getElementById('btn-upload-sources');
      if(uploadButton)uploadButton.disabled=busy;
      const uploadLabel=document.getElementById('upload-sources-label');
      if(uploadLabel)uploadLabel.textContent=selectedStudyFiles.length+selectedStudyWebsites.length?'Add more source materials':'Upload source materials';
      const button=document.getElementById('btn-generate-document-sprint');
      if(button)button.disabled=!(selectedStudyFiles.length+selectedStudyWebsites.length)||busy;
      ['study-website-url','btn-add-website','document-upload-input'].forEach(id=>{const element=document.getElementById(id);if(element)element.disabled=busy;});
      renderStudioDeskContext();
    }
    let documentGenerationInProgress = false;
    function bytesToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
      }
      return btoa(binary);
    }
    async function generateDocumentQuestionBatch() {
      if (!(selectedStudyFiles.length+selectedStudyWebsites.length) || documentGenerationInProgress || studyFileReadInProgress) return;
      if(!document.getElementById('upload-safety').checked){document.getElementById('document-gen-status').textContent='Confirm that your material is non-sensitive and you have permission to upload it.';document.getElementById('upload-safety').focus();return;}
      let settings;
      try{settings=readSprintSettings();}catch(error){alert(error.message);return;}
      const target=settings.questions;
      const targetPractical=settings.mode===0?0:settings.mode===2?target:Math.round(target*0.6);
      const targetTheory=target-targetPractical;
      const button = document.getElementById('btn-generate-document-sprint');
      const status = document.getElementById('document-gen-status');
      const generationInterests = getBrainHooks();
      if(!generationInterests.length&&!confirm('No interests selected. Create questions without personalisation?'))return;
      const fingerprint = JSON.stringify({ files:selectedStudyFiles.map(file => [file.name,file.size,file.lastModified]), websites:selectedStudyWebsites.slice(), interests:generationInterests, count:target, mode:settings.mode });
      if (pendingDocumentFingerprint !== fingerprint) {
        pendingDocumentQuestions = [];
        pendingDocumentFingerprint = fingerprint;
      }
      documentGenerationInProgress = true; trackQuestionOperation(1); syncTimerControls(); renderStudyFiles();
      let generationSucceeded = false;
      startAiLoading('btn-generate-document-sprint');
      try {
        const generationWebsites=selectedStudyWebsites.slice();
        const names = [...selectedStudyFiles.map(file => file.name),...generationWebsites];
        const parts = [];
        const documents = [];
        const sourceNotes = [];
        for (const file of selectedStudyFiles) {
          updateAiLoading('btn-generate-document-sprint', 10);
          const mimeType = studyFileType(file);
          if (mimeType === 'application/pdf') {
            const data=bytesToBase64(await file.arrayBuffer());
            documents.push({name:file.name,mimeType,data});
            parts.push({ inlineData: { mimeType, data } });
          } else {
            const text = mimeType==='application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? (studyFileTextCache.get(file) || await extractDocxText(await file.arrayBuffer())) : (await file.text()).trim();
            if (!text) throw new Error(file.name + ' is empty. Remove it or upload a file with readable text.');
            sourceNotes.push({ name: file.name, text });
            documents.push({name:file.name,text});
          }
        }
        const preparedBytes=sourceNotes.reduce((sum,note)=>sum+new TextEncoder().encode(note.text).byteLength,0)+selectedStudyFiles.filter(file=>studyFileType(file)==='application/pdf').reduce((sum,file)=>sum+file.size,0);
        if(preparedBytes>MAX_STUDY_BYTES)throw new Error('The extracted text and PDFs exceed 8 MB. Use fewer or more focused sources.');
        const hooks = generationInterests;
        const interestInstruction = hooks.length
          ? 'Only for theory questions, use these student interests for memorable examples where they fit: ' + hooks.join(', ') + '. Keep the course concept explicit and the explanation accurate. Do not introduce these interests into practical questions.'
          : 'Use clear, familiar everyday examples for theory questions.';
        const prompt = `Create exactly ${target} four-option multiple-choice questions from the attached course documents, with exactly ${targetPractical} practical questions and ${targetTheory} theory questions. Practical questions should test application through scenarios, procedures, calculations, or worked examples. Include code questions only when the documents teach programming. Theory questions should test concepts from the documents. Use only the supplied course material and facts needed to interpret it. ${interestInstruction}
For every question, set questionType to "practical" or "theory" and sourceDoc to exactly one of the supplied file names. Set correct to the zero-based index (0–3) of the single correct option. Include a concise explanation grounded in the source. Do not repeat questions. Keep prompts and explanations concise (at most 45 words each), options short, and code snippets at most 12 lines. Return only the compact JSON array matching the response schema, without Markdown fences or surrounding commentary.
${sourceNotes.map(note => `\n\nDOCUMENT: ${note.name}\n${note.text}`).join('')}`;
        const schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: {
          questionType: { type: 'STRING', enum: ['practical', 'theory'] }, sourceDoc: { type: 'STRING', enum: names },
          lecture: { type: 'INTEGER' }, topic: { type: 'STRING' }, prompt: { type: 'STRING' },
          code: { type: 'STRING', nullable: true }, options: { type: 'ARRAY', items: { type: 'STRING' } },
          correct: { type: 'INTEGER' }, explanation: { type: 'STRING' }, analogyTheme: { type: 'STRING', nullable: true }
        }, required: ['questionType','sourceDoc','topic','prompt','options','correct','explanation'] } };
        const requestBody = {
          systemInstruction: { parts: [{ text: 'You create careful, accurate university study questions. Follow the source-grounding and exact-count requirements. Never invent unsupported course-specific facts.' }] },
          contents: [{ role: 'user', parts: [...parts, ...sourceNotes.map(note => ({ text:'DOCUMENT: ' + note.name + '\n' + note.text })), ...(parts.length||sourceNotes.length?[]:[{text:'Create questions from the website sources supplied with this request.'}])] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.3, maxOutputTokens: 32768 }
        };
        if (status) status.textContent = 'Uploading once, then creating checked question batches…';
        const generated = await callGemini(prompt, schema, GEMINI_MODEL_ID, { requestBody, documents, maxRetries: 0, documentSprint: true, documentWebsites:generationWebsites, documentQuestions:pendingDocumentQuestions.slice(), documentInterests:generationInterests, documentCount:target, documentMode:['theory','mixed','practical'][settings.mode],
          onDocumentBatch:batch => {
            const seen = new Set(pendingDocumentQuestions.map(documentQuestionKey));
            for (const question of batch) {
              if (!validDocumentQuestion(question, names)) continue;
              const key = documentQuestionKey(question);
              if (!seen.has(key) && pendingDocumentQuestions.length < target) {
                seen.add(key); pendingDocumentQuestions.push(question);
              }
            }
          },
          progressButtonId: 'btn-generate-document-sprint' });
        if (!Array.isArray(generated) || generated.length !== target) throw new Error('The study service returned ' + (Array.isArray(generated) ? generated.length : 0) + ' of ' + target + ' questions. No partial set was loaded. Your files are still selected; please retry.');
        const practical = generated.filter(q => q?.questionType === 'practical').length;
        const theory = generated.filter(q => q?.questionType === 'theory').length;
        const valid = generated.every(q => validDocumentQuestion(q, names)) &&
          new Set(generated.map(documentQuestionKey)).size === target;
        if (!valid || practical !== targetPractical || theory !== targetTheory) throw new Error('The response missed a required question, source, answer, or the selected question-type split. Your current sprint is unchanged. Please retry once.');
        const stamp = Date.now().toString(36);
        const questions = generated.map((q, index) => ({
          ...q, id: `DOC-${stamp}-${index + 1}`, lecture: Math.min(5, Math.max(1, Number(q.lecture) || 1)),
          isAI: true, isDocumentGenerated: true, isAnalogyTheory: q.questionType === 'theory'
        }));
        QUESTION_BANK.push(...questions);
        try { localStorage.setItem('exam_sprint_questions_v2', JSON.stringify(QUESTION_BANK.filter(q => q.isAI)));localStorage.setItem('studioza_saved_at_v1',String(Date.now())); } catch (error) {}
        sprintSourceIds=questions.map(q=>q.id);
        activeSprintSize=target;activeSprintMinutes=settings.minutes;isCustomSprint=true;isShuffled=true;isSingleCardView=true;
        activeLectureFilter=['analogy','all','scenario'][settings.mode];buildSprintPool();
        currentQIndex = 0; userAnswers = {}; flaggedQuestions = {}; timeSpentPerQuestion = {};
        isSprintFinished = false; hasSprintStarted = false; isTimerPaused = true; totalSprintSeconds = settings.minutes*60; remainingSprintSeconds = totalSprintSeconds; elapsedSprintSeconds = 0;
        const scope = document.getElementById('scope-filter-select'); if (scope) scope.value = 'ai';
        generationSucceeded = true;
        pendingDocumentQuestions = []; pendingDocumentFingerprint = '';
        if (status) status.textContent = 'Your next sprint is ready. '+practical+' practical · '+theory+' theory. Select Start when you’re ready.';
        toggleStudyDesk(false);
        playHarmonicChime('complete'); updateFilterPills(); renderAll();
      } catch (error) {
        console.error('Document question generation:', error);
        if (status) status.textContent = (pendingDocumentQuestions.length ? pendingDocumentQuestions.length + ' / '+target+' checked questions kept for retry. Press Create again to continue. ' : '') + (error.message || 'Could not create the sprint. Your existing questions remain available.');
      } finally {
        documentGenerationInProgress = false;
        trackQuestionOperation(-1);
        finishAiLoading('btn-generate-document-sprint', generationSucceeded);
        syncTimerControls(); renderStudyFiles();
      }
    }
    function getBrainHooks() { return selectedBrainHooks.slice(); }
    function saveBrainHooks() {
      try { localStorage.setItem('exam_sprint_brain_hooks_v1', JSON.stringify(selectedBrainHooks)); } catch (e) {}
      updateBrainHookUI();
      setAiStatus('');
    }
    function closeBrainHookOptions() {
      document.getElementById('brain-hook-options')?.classList.add('hidden');
      document.getElementById('brain-hook-search')?.setAttribute('aria-expanded', 'false');
    }
    function removeBrainHook(name) {
      selectedBrainHooks = selectedBrainHooks.filter(item => item !== name);
      saveBrainHooks();
    }
    function selectBrainHook(name) {
      name = String(name).trim().slice(0,40);
      if (!name) return;
      if (selectedBrainHooks.some(item => item.toLowerCase() === name.toLowerCase())) {
        closeBrainHookOptions(); return;
      }
      if (selectedBrainHooks.length >= 3) {
        setAiStatus('Choose up to 3 interests. Remove one to change your selection.'); return;
      }
      selectedBrainHooks.push(name);
      saveBrainHooks();
      document.getElementById('brain-hook-search').value = '';
      closeBrainHookOptions();
    }
    function openBrainHookOptions() { renderBrainHookOptions(); }
    function renderBrainHookOptions() {
      const panel = document.getElementById('brain-hook-options');
      const input = document.getElementById('brain-hook-search');
      if (!panel || !input) return;
      const query = input.value.trim().toLowerCase();
      panel.replaceChildren();
      function appendOption(name, custom = false) {
        const selected = selectedBrainHooks.some(item => item.toLowerCase() === name.toLowerCase());
        const option = document.createElement('button');
        option.type = 'button'; option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(selected));
        option.className = 'block w-full min-h-11 text-left px-2.5 py-2 rounded-lg text-sm hover:bg-slate-800 ' + (selected ? 'text-sky-300' : 'text-slate-200');
        option.textContent = (selected ? '✓ ' : '') + name + (custom ? ' (custom)' : '');
        option.onclick = () => selectBrainHook(name);
        panel.appendChild(option);
      }
      Object.values(BRAIN_HOOK_GROUPS).flat().filter(name => name.toLowerCase().includes(query)).forEach(name => appendOption(name));
      if (query && !Object.values(BRAIN_HOOK_GROUPS).flat().some(name => name.toLowerCase() === query) &&
          !selectedBrainHooks.some(name => name.toLowerCase() === query)) appendOption(input.value.trim().slice(0,40), true);
      panel.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
    }
    function handleBrainHookKey(event) {
      if (event.key === 'Escape') { closeBrainHookOptions(); return; }
      const options = document.getElementById('brain-hook-options');
      if (event.key === 'ArrowDown') {
        event.preventDefault(); renderBrainHookOptions(); options.querySelector('button')?.focus();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const query = event.target.value.trim();
        if (!query) return;
        const match = Object.values(BRAIN_HOOK_GROUPS).flat().find(name => name.toLowerCase().includes(query.toLowerCase()));
        selectBrainHook(match || query);
      }
    }
    function updateBrainHookUI() {
      const chips = document.getElementById('brain-hook-chips');
      if (chips) {
        chips.replaceChildren();
        selectedBrainHooks.forEach(name => {
          const chip = document.createElement('span');
          chip.className = 'inline-flex items-center gap-1 rounded-full bg-sky-500/15 border border-sky-500/30 pl-3 text-xs text-sky-200';
          const label = document.createElement('span'); label.textContent = name;
          const remove = document.createElement('button'); remove.type = 'button';
          remove.setAttribute('aria-label', 'Remove ' + name);
          remove.className = 'min-h-9 min-w-9 rounded-full text-sky-300 hover:bg-slate-700 hover:text-white';
          remove.textContent = '×'; remove.onclick = () => removeBrainHook(name);
          chip.append(label, remove); chips.appendChild(chip);
        });
      }
      const ready = selectedBrainHooks.length > 0 && QUESTION_BANK.length > 0;
      ['btn-reskin-theory','btn-generate-ai-batch'].forEach(id => {
        const button = document.getElementById(id);
        if (button) { button.disabled = !ready || aiLoadingJobs.has(id); button.classList.toggle('opacity-50', !ready); button.title = !QUESTION_BANK.length ? 'Upload documents or load starter questions first' : ready ? '' : 'Select an interest first'; }
      });
      const requirement = document.getElementById('brain-hook-requirement');
      if (requirement) requirement.textContent = selectedBrainHooks.length ? selectedBrainHooks.length + ' / 3 interests selected' : 'Choose up to 3 interests.';
    }
    function setAiStatus(message) { const el=document.getElementById('ai-gen-status'); if(el) el.textContent=message; }
    function loadSavedAiQuestionsAndKey() {
      try {
        localStorage.removeItem('baa1118_gemini_api_key');
        const hooks=JSON.parse(localStorage.getItem('exam_sprint_brain_hooks_v1') || '[]');
        selectedBrainHooks = Array.isArray(hooks) ? hooks.slice(0,3).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : [];
        updateBrainHookUI();
        const savedAiQs=JSON.parse(localStorage.getItem('exam_sprint_questions_v2') || '[]');
        if(Array.isArray(savedAiQs)) savedAiQs.forEach(q=>{ if(q && typeof q.id==='string' && typeof q.sourceDoc==='string' && validDocumentQuestion(q,[q.sourceDoc]) && !QUESTION_BANK.some(existing=>existing.id===q.id)) QUESTION_BANK.push(q); });
        const savedReskins=JSON.parse(localStorage.getItem('exam_sprint_reskins_v2') || '{}');
        if(savedReskins && typeof savedReskins==='object') QUESTION_BANK.forEach(q=>{ const x=savedReskins[q.id]; if(x && isTheoryQuestion(q) && Array.isArray(x.options) && x.options.length===4) { q.prompt=x.prompt; q.options=x.options; q.explanation=x.explanation || q.explanation; q.analogyTheme=x.analogyTheme || q.analogyTheme; q.isReskinned=true; } });
        const allBtn=document.getElementById('flt-all'); if(allBtn) allBtn.textContent=`All (${QUESTION_BANK.length})`;
        updateFilterPills();
      } catch(e) { setAiStatus('Saved AI customisation could not be loaded. The built-in question bank is ready.'); }
    }
    function parseGeminiQuestionResponse(data) {
      const candidate = data?.candidates?.[0];
      const reason = candidate?.finishReason || '';
      const blockReason = data?.promptFeedback?.blockReason;
      if (blockReason) {
        throw new Error('Google could not process this request (' + blockReason + '). Try different source material. Your question bank is unchanged.');
      }
      if (reason === 'MAX_TOKENS' || reason === 'CONTINUATION') {
        throw new Error('Google stopped before the question set was complete (response limit). Your files are still selected. Please retry; your question bank is unchanged.');
      }
      if (reason && reason !== 'STOP' && reason !== 'FINISH_REASON_UNSPECIFIED') {
        throw new Error('Google stopped this request (' + reason + '). Your question bank is unchanged. Try again or use different source material.');
      }
      const raw = candidate?.content?.parts
        ?.filter(part => typeof part.text === 'string' && !part.thought)
        .map(part => part.text).join('');
      if (!raw?.trim()) {
        throw new Error(data?.error?.message || 'Google returned no questions. Your files are still selected and your question bank is unchanged.');
      }
      let text = raw.replace(/^\uFEFF/, '').trim();
      // Remove only a complete outer Markdown fence; never repair or accept partial JSON.
      const fenced = text.match(/^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/i);
      if (fenced) text = fenced[1].trim();
      try {
        return JSON.parse(text);
      } catch (error) {
        console.warn('AI response format issue', {
          finishReason: reason || 'not supplied',
          responseCharacters: raw.length,
          outputTokens: data?.usageMetadata?.candidatesTokenCount
        });
        throw new Error('Google returned an unreadable question set. Your files are still selected. Please retry; your question bank is unchanged.');
      }
    }

    function describeAiRequestError(data, responseText, statusText) {
      const error = data?.error;
      const primary = typeof error === 'string' ? error : error?.message;
      const details = [];
      if (Array.isArray(error?.details)) {
        error.details.forEach(detail => {
          if (Array.isArray(detail?.fieldViolations)) {
            detail.fieldViolations.forEach(violation => {
              const field = typeof violation.field === 'string' ? violation.field : '';
              const description = typeof violation.description === 'string' ? violation.description : '';
              if (field || description) details.push((field ? field + ': ' : '') + description);
            });
          } else if (typeof detail?.reason === 'string') {
            details.push(detail.reason);
          } else if (typeof detail?.description === 'string') {
            details.push(detail.description);
          }
        });
      }
      return [primary || responseText || statusText || 'No error details were returned.', ...details]
        .map(value => String(value).slice(0, 500)).join(' ').slice(0, 1500);
    }

    async function readDocumentSprintStream(response, buttonId, onBatch, target = 50) {
      if (!response.body) throw new Error('The study service did not open a generation stream. Your files are still selected.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', result = null, bytes = 0, finished = false;
      function consume(line) {
        if (!line.trim()) return;
        let event;
        try { event = JSON.parse(line); } catch (error) {
          throw new Error('The generation connection returned an unreadable update. Your files are still selected; no partial sprint was loaded.');
        }
        if (event.type === 'error') throw new Error((event.error?.message || 'Question generation stopped. Your files are still selected.')+(event.requestId?' Reference: '+event.requestId:''));
        if (event.type === 'progress' && Number.isInteger(event.completed) && event.completed >= 0 && event.completed <= target && event.total === target) {
          const job = aiLoadingJobs.get(buttonId);
          if (job) {
            job.determinate = true;
            updateAiLoading(buttonId, 5 + event.completed / target * 90);
            const caption = job.progress.querySelector('p');
            if (caption) caption.textContent = event.completed + ' / '+target+' questions ready';
          }
          const status = document.getElementById('document-gen-status');
          if (status) status.textContent = typeof event.message === 'string' ? event.message : event.completed + ' of '+target+' questions checked';
        }
        if (event.type === 'batch') {
          if (!Array.isArray(event.questions) || event.questions.length > target) throw new Error('The study service returned an invalid batch.');
          if (onBatch) onBatch(event.questions);
        }
        if (event.type === 'result') {
          if (!Array.isArray(event.questions)) throw new Error('The study service returned an invalid question set.');
          result = event.questions;
        }
      }
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 2 * 1024 * 1024) throw new Error('The question response exceeded the safe size limit. Your files and existing bank are unchanged.');
          buffer += decoder.decode(part.value, { stream:true });
          let newline;
          while ((newline = buffer.indexOf('\n')) !== -1) {
            consume(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
        if (!result) throw new Error('The generation connection ended before all questions were ready. Your files are still selected; please retry.');
        finished = true;
        return result;
      } finally {
        if (!finished) { try { await reader.cancel(); } catch (error) {} }
        reader.releaseLock();
      }
    }

    async function callGemini(prompt, schema, modelId, callOptions = {}) {
      const requestBody = callOptions.requestBody || { systemInstruction: { parts: [{ text: prompt }] }, contents: [{ role: 'user', parts: [{ text: 'Return the requested JSON now.' }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } };
      const endpoint = '/api/generate';
      const maxRetries = Number.isInteger(callOptions.maxRetries) ? callOptions.maxRetries : 3;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (callOptions.progressButtonId) updateAiLoading(callOptions.progressButtonId, 15);
        const token = await getTurnstileToken();
        if (callOptions.progressButtonId) updateAiLoading(callOptions.progressButtonId, 25);
        let response;
        try {
          response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({turnstileToken:token,task:'document-sprint',documents:callOptions.documents,documentQuestions:callOptions.documentQuestions,documentInterests:callOptions.documentInterests,documentCount:callOptions.documentCount,documentMode:callOptions.documentMode}) });
        } catch (networkError) {
          resetTurnstileWidget();
          if (attempt < maxRetries) {
            const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 350);
            setAiStatus('Could not reach the Gemini Worker. Complete the security check again after the retry delay (' + (attempt + 1) + '/' + maxRetries + ')…');
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error('Could not reach the Gemini Worker after ' + (attempt + 1) + (attempt ? ' attempts' : ' attempt') + '. Check your connection and try again.');
        }
        if (response.ok && (response.headers.get('Content-Type') || '').includes('application/x-ndjson')) {
          try { return await readDocumentSprintStream(response, callOptions.progressButtonId, callOptions.onDocumentBatch, callOptions.documentCount); }
          finally { resetTurnstileWidget(); }
        }
        let responseText = '';
        try { responseText = await response.text(); } finally { resetTurnstileWidget(); }
        let data = {};
        try { data = JSON.parse(responseText); } catch (parseError) {
          if (response.ok) throw new Error('The study service returned an unreadable response. Your files are still selected. Please retry; your question bank is unchanged.');
        }
        if (response.ok) {
          if (callOptions.progressButtonId) updateAiLoading(callOptions.progressButtonId, 90);
          return parseGeminiQuestionResponse(data);
        }
        const message = describeAiRequestError(data, responseText, response.statusText);
        const transient = [408, 429, 500, 502, 503, 504].includes(response.status);
        if (transient && attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 350);
          setAiStatus('The Gemini Worker is temporarily unavailable (' + response.status + '). Complete the security check again after the retry delay (' + (attempt + 1) + '/' + maxRetries + ')…');
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        const attempts = attempt > 0 ? ' after ' + (attempt + 1) + ' attempts' : '';
        throw new Error(message+(data.requestId?' Reference: '+data.requestId:'')+' Your files are still selected and your question bank is unchanged.');
      }
    }



    // Make room for a newly opened setup section while keeping that section open.
    function initSetupPanelSizing() {
  window.matchMedia('(max-width:760px)').addEventListener('change',()=>toggleStudyDesk(false));
}



    let studioSourcePage=0;
    let studioSourceFingerprint='';
    let studioFitFrame=null;
    function getStudioSourceCards(){
      const pending=[
        ...selectedStudyFiles.map((file,index)=>({name:file.name,kind:'Document',meta:Math.max(1,Math.round(file.size/1024))+' KB · Ready',removeType:'file',index})),
        ...selectedStudyWebsites.map((url,index)=>({name:url,kind:'Website',meta:'Ready to read',removeType:'website',index}))
      ];
      if(pending.length)return pending;
      return [...new Set(activeQuestions.map(q=>q.sourceDoc).filter(Boolean))].map(name=>({
        name,kind:/^https?:\/\//i.test(name)?'Website':'Document',
        meta:activeQuestions.filter(q=>q.sourceDoc===name).length+' questions · Saved',removeType:null
      }));
    }
    function renderStudioSourceCarousel(){
      const cards=getStudioSourceCards();
      const items=cards.length?cards:[{name:'Add your material',kind:'Source material',meta:'Upload notes or add a website.'}];
      const busy=documentGenerationInProgress||studyFileReadInProgress;
      const pages=Math.ceil(items.length/2);
      studioSourcePage=Math.min(studioSourcePage,pages-1);
      const fingerprint=JSON.stringify({items,busy});
      const track=document.getElementById('source-carousel-track');
      if(fingerprint!==studioSourceFingerprint){
        track.replaceChildren();
        for(let pageIndex=0;pageIndex<pages;pageIndex++){
          const page=document.createElement('div');page.className='source-carousel-page';page.setAttribute('role','group');page.setAttribute('aria-label','Sources page '+(pageIndex+1)+' of '+pages);
          items.slice(pageIndex*2,pageIndex*2+2).forEach(source=>{
            const card=document.createElement('article');card.className='source-card';card.title=source.name;
            const type=document.createElement('span');type.className='source-card-kind';type.textContent=source.kind;
            const title=document.createElement('p');title.className='source-card-title';title.textContent=source.name;
            const meta=document.createElement('p');meta.className='source-card-meta';meta.textContent=source.meta;
            card.append(type,title,meta);
            if(source.removeType){
              const remove=document.createElement('button');remove.type='button';remove.className='source-card-remove';remove.textContent='×';remove.setAttribute('aria-label','Remove '+source.name);remove.disabled=busy;
              remove.onclick=()=>source.removeType==='file'?removeStudyFile(source.index):removeStudyWebsite(source.index);
              card.appendChild(remove);
            }
            page.appendChild(card);
          });
          track.appendChild(page);
        }
        studioSourceFingerprint=fingerprint;
      }
      updateStudioSourcePage(cards.length,pages);
    }
    function updateStudioSourcePage(count,pages){
      const track=document.getElementById('source-carousel-track');
      track.style.transform='translateX(-'+studioSourcePage*100+'%)';
      [...track.children].forEach((page,index)=>{page.inert=index!==studioSourcePage;page.setAttribute('aria-hidden',String(index!==studioSourcePage));});
      document.getElementById('source-previous').disabled=studioSourcePage===0;
      document.getElementById('source-next').disabled=studioSourcePage>=pages-1;
      document.getElementById('source-page-indicator').textContent=count?(studioSourcePage*2+1)+'–'+Math.min(count,studioSourcePage*2+2)+' of '+count+' source'+(count===1?'':'s'):'No sources added';
    }
    function pageStudioSources(direction){
      const count=getStudioSourceCards().length,pages=Math.max(1,Math.ceil(count/2));
      studioSourcePage=Math.max(0,Math.min(pages-1,studioSourcePage+direction));
      updateStudioSourcePage(count,pages);
    }
    function handleSourceCarouselKey(event){
      if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
      event.preventDefault();event.stopPropagation();pageStudioSources(event.key==='ArrowRight'?1:-1);
    }
    function scheduleStudioFit(){
      if(studioFitFrame!==null)cancelAnimationFrame(studioFitFrame);
      studioFitFrame=requestAnimationFrame(()=>{studioFitFrame=null;fitStudioPanels();});
    }
    function fitStudioPanels(){
      const layout=document.getElementById('study-layout'),workspace=document.getElementById('study-session'),rail=document.getElementById('telemetry-dashboard');
      layout.style.removeProperty('--studio-panel-height');
      layout.style.setProperty('--reading-density','1');
      if(!window.matchMedia('(min-width:1191px)').matches)return;
      const content=document.querySelector('.question-scroll');
      if(content){
        for(const density of [1,.97,.94,.92]){
          layout.style.setProperty('--reading-density',String(density));
          if(content.scrollHeight<=content.clientHeight+1)break;
        }
      }
      const questionOverflow=content?Math.max(0,content.scrollHeight-content.clientHeight):0;
      const railOverflow=Math.max(0,rail.scrollHeight-rail.clientHeight);
      if(questionOverflow>1||railOverflow>1){
        const height=workspace.getBoundingClientRect().height+Math.max(questionOverflow,railOverflow)+2;
        layout.style.setProperty('--studio-panel-height',Math.ceil(height)+'px');
      }
    }

    let studioCourseTitle='Your practice';
    let deskReturnFocus=null;
    function syncStudioHeader(){
      const progress=document.getElementById('header-sprint-progress');
      if(progress)progress.textContent='Sprint '+String(activeQuestions.length?currentQIndex+1:0).padStart(2,'0')+' / '+String(activeQuestions.length).padStart(2,'0');
      const timer=document.getElementById('header-time-remaining');if(timer)timer.textContent=formatMinSec(remainingSprintSeconds);
    }
    function syncStudioMode(){
      const input=document.getElementById('sprint-mode');
      document.querySelectorAll('#question-mode-control button').forEach(button=>{
        const selected=Number(button.dataset.mode)===Number(input.value);
        button.setAttribute('aria-checked',String(selected));button.tabIndex=selected?0:-1;button.disabled=input.disabled;
      });
    }
    function handleModeKey(event,index){
      const offset=event.key==='ArrowRight'||event.key==='ArrowDown'?1:event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:0;
      if(!offset&&event.key!=='Home'&&event.key!=='End')return;
      event.preventDefault();event.stopPropagation();
      const next=event.key==='Home'?0:event.key==='End'?2:(index+offset+3)%3;
      setSprintMode(next);document.querySelector('#question-mode-control button[data-mode="'+next+'"]')?.focus();
    }
    function chooseStudioAnswer(id,index){
      if(isSprintFinished)return;
      selectOption(id,index);
      document.getElementById('answer-'+currentQIndex+'-'+index)?.focus({preventScroll:true});
    }
    function handleAnswerKey(event,index){
      const offset=event.key==='ArrowDown'||event.key==='ArrowRight'?1:event.key==='ArrowUp'||event.key==='ArrowLeft'?-1:0;
      if(!offset&&event.key!=='Home'&&event.key!=='End')return;
      event.preventDefault();event.stopPropagation();
      const next=event.key==='Home'?0:event.key==='End'?3:(index+offset+4)%4;
      const question=activeQuestions[currentQIndex];if(question)chooseStudioAnswer(question.id,next);
    }
    function focusActiveQuestion(){
      syncStudioHeader();
      document.getElementById('active-question-heading')?.focus({preventScroll:true});
    }
    function openSourcePicker(){
      if(documentGenerationInProgress||studyFileReadInProgress)return;
      // Keep the native picker in the tap gesture and do not schedule drawer focus over it.
      if(window.matchMedia('(max-width:760px)').matches&&!document.body.classList.contains('desk-is-open'))toggleStudyDesk(true,false);
      const picker=document.getElementById('document-upload-input');
      picker.value='';
      picker.click();
    }
    function toggleStudyDesk(show,focusDesk=true){
      const mobile=window.matchMedia('(max-width:760px)').matches;
      const open=!!show&&mobile,desk=document.getElementById('study-setup');
      if(open&&!document.body.classList.contains('desk-is-open'))deskReturnFocus=document.activeElement;
      document.body.classList.toggle('desk-is-open',open);
      desk.inert=mobile&&!open;
      document.getElementById('desk-backdrop').hidden=!open;
      document.getElementById('btn-open-study-desk').setAttribute('aria-expanded',String(open));
      ['study-session','telemetry-dashboard'].forEach(id=>{document.getElementById(id).inert=open;});
      document.querySelector('.studio-header').inert=open;
      document.querySelector('.studio-footer').inert=open;
      if(open){desk.setAttribute('role','dialog');desk.setAttribute('aria-modal','true');if(focusDesk)requestAnimationFrame(()=>{if(document.body.classList.contains('desk-is-open'))desk.querySelector('.desk-close').focus();});}
      else{desk.removeAttribute('role');desk.removeAttribute('aria-modal');if(deskReturnFocus?.isConnected){deskReturnFocus.focus({preventScroll:true});deskReturnFocus=null;}}
    }
    function renderStudioDeskContext(){
      const saved=[...new Set(activeQuestions.map(q=>q.sourceDoc).filter(Boolean))];
      renderStudioSourceCarousel();
      const select=document.getElementById('study-source-select');
      const unique=[...new Set(QUESTION_BANK.map(q=>q.sourceDoc).filter(Boolean))];
      select.replaceChildren();
      const all=document.createElement('option');all.value='';all.textContent='All saved sources';select.appendChild(all);
      unique.forEach(source=>{const option=document.createElement('option');option.value=source;option.textContent=source;select.appendChild(option);});
      if(sprintSourceIds){const sourceIds=new Set(sprintSourceIds);const selectedSources=[...new Set(QUESTION_BANK.filter(q=>sourceIds.has(q.id)).map(q=>q.sourceDoc).filter(Boolean))];if(selectedSources.length===1)select.value=selectedSources[0];}
      document.getElementById('header-course-title').textContent=studioCourseTitle;
      document.getElementById('desk-course-title').textContent=studioCourseTitle;
    }
    function openStudioCoursePicker(){toggleStudyDesk(false);document.getElementById('course-picker').showPopover();document.getElementById('course-title-input').focus();}
    function saveCourseTitle(){
      const value=document.getElementById('course-title-input').value.trim();
      if(!value){document.getElementById('course-title-input').focus();return;}
      studioCourseTitle=value;
      try{localStorage.setItem('studioza_course_title_v1',value);}catch(error){}
      renderStudioDeskContext();document.getElementById('course-picker').hidePopover();
    }
    function selectStudySource(source){
      if(documentGenerationInProgress){renderStudioDeskContext();return;}
      if(Object.keys(userAnswers).length&&!confirm('Change the study source? This resets the current sprint answers; your question bank stays saved.')){renderStudioDeskContext();return;}
      sprintSourceIds=source?QUESTION_BANK.filter(q=>q.sourceDoc===source).map(q=>q.id):null;
      const settings=readSprintSettingsSafe();if(settings){activeSprintSize=settings.questions;activeSprintMinutes=settings.minutes;activeLectureFilter=['analogy','all','scenario'][settings.mode];isCustomSprint=true;}
      isShuffled=true;buildSprintPool();renderAll();document.getElementById('course-picker').hidePopover();
    }
    function initStudioza(){
      try{studioCourseTitle=localStorage.getItem('studioza_course_title_v1')||'Your practice';}catch(error){}
      document.getElementById('course-title-input').value=studioCourseTitle;
      renderStudioDeskContext();syncStudioMode();toggleStudyDesk(false);
      window.addEventListener('resize',scheduleStudioFit);
      document.addEventListener('toggle',scheduleStudioFit,true);
      if(document.fonts?.ready)document.fonts.ready.then(scheduleStudioFit);
      scheduleStudioFit();
      document.addEventListener('keydown',event=>{
        if(!document.body.classList.contains('desk-is-open'))return;
        if(event.key==='Escape'){event.preventDefault();toggleStudyDesk(false);return;}
        if(event.key!=='Tab')return;
        const targets=[...document.getElementById('study-setup').querySelectorAll('button:not([disabled]),input:not([disabled]),summary,select:not([disabled]),[tabindex="0"]')].filter(element=>element.getClientRects().length&&element.tabIndex>=0);
        const first=targets[0],last=targets[targets.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      });
    }

    window.addEventListener('DOMContentLoaded', () => {
      expireSavedStudyData();
      clearLegacyQuestionMemory();
      initEngine();
      loadSavedAiQuestionsAndKey();
      if(!restoreSprintState())buildSprintPool();
      isSprintStateReady = true;
      renderAll();
      draftSettingsChanged();
      initSetupPanelSizing();
      initStudioza();
      document.addEventListener('click', (event) => {
        const picker = document.getElementById('brain-hook-picker');
        const panel = document.getElementById('brain-hook-options');
        if (picker && panel && !picker.contains(event.target)) closeBrainHookOptions();
        const options = document.getElementById('options-menu');
        if (options && !options.contains(event.target)) options.open = false;
      });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { const options=document.getElementById('options-menu'); if(options) options.open=false; } });
    });
  
// Build-time compiled handlers: no inline event execution, eval or Function constructor.
const studiozaHandlers={
 h0:function(event){onStudyTurnstileLoadError()},
 h1:function(event){event.preventDefault();cancelAiSecurityCheck()},
 h2:function(event){cancelAiSecurityCheck()},
 h3:function(event){document.getElementById('finish-sprint-dialog').close()},
 h4:function(event){confirmFinishSprint()},
 h5:function(event){togglePauseTimer()},
 h6:function(event){toggleStudyDesk(true)},
 h7:function(event){toggleFeedbackMode()},
 h8:function(event){toggleChimes()},
 h9:function(event){toggleBrownNoise()},
 h10:function(event){toggleDyslexiaMode()},
 h11:function(event){clearUploadHistory()},
 h12:function(event){event.preventDefault();saveCourseTitle()},
 h13:function(event){selectStudySource(this.value)},
 h14:function(event){toggleStudyDesk(false)},
 h15:function(event){openStudioCoursePicker()},
 h16:function(event){event.preventDefault();this.classList.add('is-drag-over')},
 h17:function(event){this.classList.remove('is-drag-over')},
 h18:function(event){event.preventDefault();this.classList.remove('is-drag-over');handleStudyFiles(event.dataTransfer.files)},
 h19:function(event){openSourcePicker()},
 h20:function(event){handleSourceCarouselKey(event)},
 h21:function(event){pageStudioSources(-1)},
 h22:function(event){pageStudioSources(1)},
 h23:function(event){handleStudyFiles(this.files)},
 h24:function(event){event.preventDefault();addStudyWebsite()},
 h25:function(event){openBrainHookOptions()},
 h26:function(event){renderBrainHookOptions()},
 h27:function(event){handleBrainHookKey(event)},
 h28:function(event){setSprintMode(0)},
 h29:function(event){handleModeKey(event,0)},
 h30:function(event){setSprintMode(1)},
 h31:function(event){handleModeKey(event,1)},
 h32:function(event){setSprintMode(2)},
 h33:function(event){handleModeKey(event,2)},
 h34:function(event){draftSettingsChanged()},
 h35:function(event){generateDocumentQuestionBatch()},
 h36:function(event){resetCurrentSprint()},
 h37:function(event){addExtraMinute()},
 h38:function(event){finishAndGradeSprint()},
 h39:function(event){clearSavedWeakHistory()},
 h40:function(event){jumpToQuestion(Number(this.dataset.questionIndex))},
 h41:function(event){chooseStudioAnswer(this.dataset.questionId,Number(this.dataset.answerIndex))},
 h42:function(event){handleAnswerKey(event,Number(this.dataset.answerIndex))},
 h43:function(event){toggleFlag(this.dataset.questionId)},
 h44:function(event){navigateQuestion(-1)},
 h45:function(event){navigateQuestion(1)}
};
for(const type of ["error","cancel","click","submit","change","dragover","dragleave","drop","keydown","focus","input"])document.addEventListener(type,event=>{
 const element=event.target?.closest?.('[data-on'+type+']');if(!element)return;
 const handler=studiozaHandlers[element.getAttribute('data-on'+type)];if(handler)handler.call(element,event);
},type==='error');

// Device-local retention and an explicit complete study-data reset. No unrelated origin keys are cleared.
const STUDIOZA_STORAGE_KEYS=['exam_sprint_questions_v2','exam_sprint_weak_ids_v2','exam_sprint_reskins_v2','exam_sprint_progress_v2','dcu_dyslexia_v2','exam_sprint_brain_hooks_v1','studioza_course_title_v1','studioza_saved_at_v1','baa1118_gemini_api_key','baa1118_ai_questions_v1','exam_sprint_reskins_v1','exam_sprint_progress_v1','baa1118_weak_ids_v1'];
function expireSavedStudyData(){try{const saved=Number(localStorage.getItem('studioza_saved_at_v1'));if(saved&&Date.now()-saved>30*24*60*60*1000)STUDIOZA_STORAGE_KEYS.forEach(key=>localStorage.removeItem(key));else if(!saved&&localStorage.getItem('exam_sprint_questions_v2'))localStorage.setItem('studioza_saved_at_v1',String(Date.now()));}catch(error){}}
function clearAllStudyData(){if(activeQuestionOperations||studyFileReadInProgress){document.getElementById('upload-clear-status').textContent='Wait for generation to finish first.';return;}if(!confirm('Clear all Studioza study data on this device, including questions, progress, interests and preferences?'))return;try{STUDIOZA_STORAGE_KEYS.forEach(key=>localStorage.removeItem(key));location.reload();}catch(error){document.getElementById('upload-clear-status').textContent='Browser storage could not be cleared. Use your browser site-data settings.';}}
window.addEventListener('DOMContentLoaded',()=>{document.getElementById('btn-clear-all-study-data').addEventListener('click',clearAllStudyData);if(location.hostname==='studioza-ai-staging.cassidyjames011.workers.dev'){const notice=document.createElement('p');notice.className='staging-notice';notice.textContent='Staging test only — synthetic answers, no real AI. Use test material only.';document.querySelector('.studio-header').appendChild(notice);}});
