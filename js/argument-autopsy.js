(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const sample = `Alex: What do you want for dinner?\nJordan: I don't care. You choose.\nAlex: Pizza?\nJordan: We had pizza two days ago.\nAlex: This is why I hate choosing.\nJordan: You always act like helping is a huge burden.\nAlex: Calm down. I was just trying to get dinner.\nJordan: Never mind. I'll figure it out myself.`;
  let mode = 'paste';

  $$('.aa-tab').forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.tab;
    $$('.aa-tab').forEach((item) => item.classList.toggle('is-active', item === button));
    $$('.aa-tab-panel').forEach((item) => item.classList.toggle('is-active', item.dataset.panel === mode));
  }));

  $('#sample-case').addEventListener('click', () => { $('#conversation').value = sample; });
  $('#screenshots').addEventListener('change', (event) => {
    const files = [...event.target.files];
    $('#file-list').textContent = files.length ? files.map((file) => file.name).join(', ') : 'No screenshots selected.';
  });

  function messages(text) {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
      const match = line.match(/^([^:]{1,30}):\s*(.+)$/);
      return {
        speaker: match ? match[1].trim() : `Participant ${(index % 2) + 1}`,
        text: match ? match[2].trim() : line
      };
    });
  }

  function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
  }

  function percent(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
  }

  function render(items, report) {
    $('#case-number').textContent = '#' + String(Math.floor(10000 + Math.random() * 89999));
    $('#trigger-quote').textContent = `"${report.turning_point.quote}"`;
    $('#trigger-detail').textContent = report.turning_point.explanation;
    $('#original-topic').textContent = report.original_topic;
    $('#became-topic').textContent = report.became_topic;
    $('#speaker-a').textContent = 'Participant A';
    $('#speaker-b').textContent = 'Participant B';

    let first = percent(report.participants?.[0]?.contribution_percent, 50);
    let second = percent(report.participants?.[1]?.contribution_percent, 100 - first);
    if (first + second !== 100) second = 100 - first;
    $('#blame-a').textContent = first + '%';
    $('#blame-b').textContent = second + '%';
    $('#bar-a').style.width = first + '%';
    $('#bar-b').style.width = second + '%';

    $('#root-cause').textContent = report.root_cause.title;
    $('#root-detail').textContent = report.root_cause.explanation;
    $('#ruling').textContent = report.ruling;
    $('#peace').textContent = report.peace_offering;

    $('#timeline').innerHTML = report.timeline.map((entry) => {
      const index = Math.max(0, Math.min(items.length - 1, Number(entry.message_index) || 0));
      const speaker = items[index]?.speaker === items[0]?.speaker ? 'Participant A' : 'Participant B';
      return `<li><b>${escapeHtml(entry.label)}</b><span><strong>${speaker}:</strong> ${escapeHtml(entry.summary)}</span></li>`;
    }).join('');
  }

  function startScanner() {
    const lines = [
      'Cataloging questionable word choices...',
      'Locating the first misunderstanding...',
      'Measuring escalation velocity...',
      'Calculating conversational fingerprints...',
      'Preparing the official ruling...'
    ];
    let index = 0;
    $('#scanner').hidden = false;
    $('#report').hidden = true;
    $('#scan-progress').style.width = '12%';
    $('#scan-message').textContent = lines[0];
    $('#scanner').scrollIntoView({ behavior: 'smooth' });
    const timer = setInterval(() => {
      index = (index + 1) % lines.length;
      $('#scan-message').textContent = lines[index];
      $('#scan-progress').style.width = Math.min(92, 20 + index * 17) + '%';
    }, 700);
    return () => {
      clearInterval(timer);
      $('#scan-progress').style.width = '100%';
    };
  }

  $('#analyze').addEventListener('click', async () => {
    const error = $('#form-error');
    const button = $('#analyze');
    error.textContent = '';

    if (!$('#consent').checked) {
      error.textContent = 'Please confirm the privacy and safety notice.';
      return;
    }
    if (mode === 'upload') {
      error.textContent = 'Screenshot reading is coming next. Please paste the conversation for this preview.';
      return;
    }

    const conversation = $('#conversation').value.trim();
    const items = messages(conversation);
    if (items.length < 4) {
      error.textContent = 'Please paste at least four messages, or load the sample case.';
      return;
    }

    button.disabled = true;
    button.textContent = 'Examining evidence...';
    const stopScanner = startScanner();

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.report) throw new Error(payload.error || 'Analysis failed. Please try again.');
      if (payload.report.safety_status === 'unsupported') {
        throw new Error(payload.report.safety_message || 'This conversation is outside the scope of Argument Autopsy.');
      }

      render(items, payload.report);
      stopScanner();
      $('#scanner').hidden = true;
      $('#report').hidden = false;
      $('#report').scrollIntoView({ behavior: 'smooth' });
    } catch (failure) {
      stopScanner();
      $('#scanner').hidden = true;
      error.textContent = failure.message || 'Analysis failed. Please try again.';
      $('#autopsy').scrollIntoView({ behavior: 'smooth' });
    } finally {
      button.disabled = false;
      button.textContent = 'Begin Argument Autopsy';
    }
  });

  $('#new-case').addEventListener('click', () => {
    $('#report').hidden = true;
    $('#autopsy').scrollIntoView({ behavior: 'smooth' });
  });

  $('#copy-summary').addEventListener('click', async () => {
    const text = `ARGUMENT AUTOPSY\nPoint of no return: ${$('#trigger-quote').textContent}\nRoot cause: ${$('#root-cause').textContent}\nRuling: ${$('#ruling').textContent}\nPeace offering: ${$('#peace').textContent}`;
    await navigator.clipboard.writeText(text);
    $('#copy-summary').textContent = 'Summary copied';
    setTimeout(() => { $('#copy-summary').textContent = 'Copy privacy-safe summary'; }, 1600);
  });
})();