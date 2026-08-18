(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const sample = `Alex: What do you want for dinner?\nJordan: I don't care. You choose.\nAlex: Pizza?\nJordan: We had pizza two days ago.\nAlex: This is why I hate choosing.\nJordan: You always act like helping is a huge burden.\nAlex: Calm down. I was just trying to get dinner.\nJordan: Never mind. I'll figure it out myself.`;
  const MAX_IMAGES = 4;
  let mode = 'paste';
  let selectedFiles = [];

  $$('input[name="analysis-mode"]').forEach((input) => input.addEventListener('change', () => {
    $('#unfiltered-disclosure').hidden = input.value !== 'unfiltered' || !input.checked;
  }));

  $$('.aa-tab').forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.tab;
    $$('.aa-tab').forEach((item) => item.classList.toggle('is-active', item === button));
    $$('.aa-tab-panel').forEach((item) => item.classList.toggle('is-active', item.dataset.panel === mode));
  }));

  $('#sample-case').addEventListener('click', () => { $('#conversation').value = sample; });
  $('#screenshots').addEventListener('change', (event) => {
    const files = [...event.target.files];
    const supported = files.filter((file) => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
    selectedFiles = supported.slice(0, MAX_IMAGES);
    if (files.length > MAX_IMAGES) {
      $('#file-list').textContent = `Only the first ${MAX_IMAGES} screenshots will be analyzed.`;
    } else if (supported.length !== files.length) {
      $('#file-list').textContent = 'Use PNG, JPEG, or WEBP screenshots.';
    } else {
      $('#file-list').textContent = selectedFiles.length
        ? selectedFiles.map((file, index) => `${index + 1}. ${file.name}`).join(' | ')
        : 'No screenshots selected.';
    }
  });

  function messages(text) {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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

  function imageData(file) {
    return new Promise((resolve, reject) => {
      const source = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1600 / image.width, 3200 / image.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(source);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.onerror = () => {
        URL.revokeObjectURL(source);
        reject(new Error(`Could not read ${file.name}.`));
      };
      image.src = source;
    });
  }

  function render(report) {
    $('#case-number').textContent = '#' + String(Math.floor(10000 + Math.random() * 89999));
    $('#trigger-quote').textContent = `"${report.turning_point.quote}"`;
    $('#trigger-detail').textContent = report.turning_point.explanation;
    $('#original-topic').textContent = report.original_topic;
    $('#became-topic').textContent = report.became_topic;
    $('#speaker-a').textContent = 'Participant A';
    $('#speaker-b').textContent = 'Participant B';

    const first = percent(report.participants?.[0]?.contribution_percent, 50);
    const second = 100 - first;
    $('#blame-a').textContent = first + '%';
    $('#blame-b').textContent = second + '%';
    $('#bar-a').style.width = first + '%';
    $('#bar-b').style.width = second + '%';

    $('#root-cause').textContent = report.root_cause.title;
    $('#root-detail').textContent = report.root_cause.explanation;
    $('#ruling').textContent = report.ruling;
    $('#peace').textContent = report.peace_offering;
    $('#timeline').innerHTML = report.timeline.map((entry) =>
      `<li><b>${escapeHtml(entry.label)}</b><span><strong>${escapeHtml(entry.speaker)}:</strong> ${escapeHtml(entry.summary)}</span></li>`
    ).join('');
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

    const analysisMode = document.querySelector(
      'input[name="analysis-mode"]:checked'
    )?.value || 'funny';
    const loginSession = await window.ArgumentAutopsyAuth.requireSession();
    if (!loginSession) return;
    if (analysisMode === 'unfiltered') {
      if (!$('#unfiltered-consent').checked) {
        error.textContent = 'Confirm that you are at least 18 and selected Unfiltered humor.';
        return;
      }
      if (!await window.ArgumentAutopsyAuth.acceptUnfilteredTerms()) {
        error.textContent = 'The Unfiltered Mode acknowledgment could not be saved.';
        return;
      }
    }

    const conversation = $('#conversation').value.trim();
    if (mode === 'paste' && messages(conversation).length < 4) {
      error.textContent = 'Please paste at least four messages, or load the sample case.';
      return;
    }
    if (mode === 'upload' && selectedFiles.length === 0) {
      error.textContent = 'Select at least one conversation screenshot.';
      return;
    }

    button.disabled = true;
    button.textContent = mode === 'upload' ? 'Reading screenshots...' : 'Examining evidence...';
    const stopScanner = startScanner();

    try {

      const requestBody = mode === 'upload'
        ? {
            images: await Promise.all(selectedFiles.map(imageData)),
            analysisMode
          }
        : {
            conversation,
            analysisMode
          };
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginSession.access_token}` },
        body: JSON.stringify(requestBody)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.report) throw new Error(payload.error || 'Analysis failed. Please try again.');
      if (payload.report.safety_status === 'unsupported') {
        throw new Error(payload.report.safety_message || 'This conversation is outside the scope of Argument Autopsy.');
      }

      render(payload.report);
      await window.ArgumentAutopsyAuth.refreshAccount();
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