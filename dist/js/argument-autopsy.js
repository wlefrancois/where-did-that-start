(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const sample = `Alex: What do you want for dinner?\nJordan: I don't care. You choose.\nAlex: Pizza?\nJordan: We had pizza two days ago.\nAlex: This is why I hate choosing.\nJordan: You always act like helping is a huge burden.\nAlex: Calm down. I was just trying to get dinner.\nJordan: Never mind. I'll figure it out myself.`;
  let mode = 'paste';

  $$('.aa-tab').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.tab;
    $$('.aa-tab').forEach(x => x.classList.toggle('is-active', x === button));
    $$('.aa-tab-panel').forEach(x => x.classList.toggle('is-active', x.dataset.panel === mode));
  }));
  $('#sample-case').addEventListener('click', () => { $('#conversation').value = sample; });
  $('#screenshots').addEventListener('change', e => {
    const files = [...e.target.files];
    $('#file-list').textContent = files.length ? files.map(x => x.name).join(', ') : 'No screenshots selected.';
  });

  function messages(text) {
    return text.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map((line, index) => {
      const match = line.match(/^([^:]{1,30}):\s*(.+)$/);
      return { speaker: match ? match[1].trim() : `Participant ${(index % 2) + 1}`, text: match ? match[2].trim() : line };
    });
  }
  function score(text) {
    const hits = text.toLowerCase().match(/always|never|whatever|fine|calm down|don't care|do not care|hate|your fault|nothing|forget it|never mind/g);
    return hits ? hits.length : 0;
  }
  function analyze(items) {
    const speakers = [...new Set(items.map(x => x.speaker))].slice(0, 2);
    while (speakers.length < 2) speakers.push(`Participant ${speakers.length + 1}`);
    let triggerIndex = items.findIndex((x, i) => i > 0 && score(x.text) > 0);
    if (triggerIndex < 0) triggerIndex = Math.max(1, Math.floor(items.length * .45));
    const trigger = items[Math.min(triggerIndex, items.length - 1)];
    const totals = Object.fromEntries(speakers.map(x => [x, 1]));
    items.forEach(x => { if (x.speaker in totals) totals[x.speaker] += score(x.text) + (/[!?]/.test(x.text) ? .25 : 0); });
    const sum = totals[speakers[0]] + totals[speakers[1]];
    let first = Math.round((totals[speakers[0]] / sum) * 100);
    first = Math.min(68, Math.max(32, first));
    const second = 100 - first;
    const lower = items.map(x => x.text.toLowerCase()).join(' ');
    const cause = /choose|want|dinner|eat|food/.test(lower) ? ['Unspoken expectations', 'A practical decision became a test of consideration. Neither participant received the hidden instructions.'] : /late|time|wait/.test(lower) ? ['Different expectations about time', 'The clock was factual; the meaning attached to it was not.'] : ['Assumed intent', 'Both participants began responding to what they thought the other person meant instead of what was actually said.'];
    return { speakers, triggerIndex, trigger, first, second, cause };
  }
  function render(items, result) {
    $('#case-number').textContent = '#' + String(Math.floor(10000 + Math.random() * 89999));
    $('#trigger-quote').textContent = `"` + result.trigger.text + `"`;
    $('#trigger-detail').textContent = `${result.trigger.speaker} introduced the first phrase likely to change the conversation from the subject to the relationship.`;
    $('#original-topic').textContent = /dinner|eat|food|pizza/.test(items.slice(0,3).map(x=>x.text.toLowerCase()).join(' ')) ? 'What to eat' : 'The original practical question';
    $('#became-topic').textContent = 'Whether anyone felt heard or appreciated';
    $('#speaker-a').textContent = 'Participant A'; $('#speaker-b').textContent = 'Participant B';
    $('#blame-a').textContent = result.first + '%'; $('#blame-b').textContent = result.second + '%';
    $('#bar-a').style.width = result.first + '%'; $('#bar-b').style.width = result.second + '%';
    $('#root-cause').textContent = result.cause[0]; $('#root-detail').textContent = result.cause[1];
    $('#ruling').textContent = result.first === result.second ? 'Both parties are equally guilty of conversational guesswork.' : 'Both parties contributed, but the real offender was unspoken context.';
    $('#peace').textContent = /dinner|eat|food|pizza/.test(items.map(x=>x.text.toLowerCase()).join(' ')) ? 'Food, a reset, and one honest sentence without the word always.' : 'A reset and one sentence beginning with: What I meant was...';
    const picks = [...new Set([0, Math.max(1,result.triggerIndex-1), result.triggerIndex, Math.min(items.length-1,result.triggerIndex+1)])];
    $('#timeline').innerHTML = picks.map((i, n) => `<li><b>${n===0?'Original topic':n===picks.length-1?'Escalation':'Evidence '+n}</b><span><strong>${items[i].speaker}:</strong> ${escapeHtml(items[i].text)}</span></li>`).join('');
  }
  function escapeHtml(value) { const d=document.createElement('div'); d.textContent=value; return d.innerHTML; }
  function runScanner(done) {
    const lines=['Cataloging questionable word choices...','Locating the first misunderstanding...','Measuring escalation velocity...','Calculating conversational fingerprints...','Preparing the official ruling...'];
    $('#scanner').hidden=false; $('#report').hidden=true; $('#scanner').scrollIntoView({behavior:'smooth'});
    let i=0; const timer=setInterval(()=>{ $('#scan-message').textContent=lines[i]; $('#scan-progress').style.width=((i+1)/lines.length*100)+'%'; i++; if(i===lines.length){clearInterval(timer);setTimeout(done,450)} },520);
  }
  $('#analyze').addEventListener('click', () => {
    const error=$('#form-error'); error.textContent='';
    if(!$('#consent').checked){error.textContent='Please confirm the privacy and safety notice.';return}
    if(mode==='upload'){error.textContent='Screenshot reading is shown in the prototype but will be connected in the AI build. Use pasted text for this demonstration.';return}
    const items=messages($('#conversation').value);
    if(items.length<4){error.textContent='Please paste at least four messages, or load the sample case.';return}
    const result=analyze(items); runScanner(()=>{render(items,result);$('#scanner').hidden=true;$('#report').hidden=false;$('#report').scrollIntoView({behavior:'smooth'})});
  });
  $('#new-case').addEventListener('click',()=>{ $('#report').hidden=true; $('#autopsy').scrollIntoView({behavior:'smooth'}); });
  $('#copy-summary').addEventListener('click', async () => {
    const text=`ARGUMENT AUTOPSY\nPoint of no return: ${$('#trigger-quote').textContent}\nRoot cause: ${$('#root-cause').textContent}\nRuling: ${$('#ruling').textContent}\nPeace offering: ${$('#peace').textContent}`;
    await navigator.clipboard.writeText(text); $('#copy-summary').textContent='Summary copied'; setTimeout(()=>$('#copy-summary').textContent='Copy privacy-safe summary',1600);
  });
})();