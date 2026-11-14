import { phraseMatches } from './phrases.js';
import { score } from './risk.js';

const get = id => document.getElementById(id);
let session;
const alert = get('alert');

const voice = window.speechSynthesis;
const warning = 'Warning. This call looks suspicious. Hang up now, and call back on a number you trust.';
let voiceUnlocked = false;
let speech;
let voiceRun;

function unlockVoice() {
  if (!voice || voiceUnlocked) return;
  voiceUnlocked = true;
  voice.speak(new SpeechSynthesisUtterance(''));
}

function speakWarning() {
  if (!voice || get('mute').checked) return;
  unlockVoice();
  voice.cancel();
  const utterance = new SpeechSynthesisUtterance(warning);
  const run = session;
  if (run?.microphone) {
    run.voicePaused = true;
    run.voiceGeneration = (run.voiceGeneration ?? 0) + 1;
    voiceRun = run;
    clearTimeout(run.resumeVoice);
  }
  speech = utterance;
  const finish = () => {
    if (speech !== utterance) return;
    speech = null;
    if (run?.microphone) {
      run.resumeVoice = setTimeout(() => {
        run.voicePaused = false;
        if (voiceRun === run) voiceRun = null;
      }, 1000);
    }
  };
  const englishVoices = voice.getVoices().filter(option => /^en(?:[-_]|$)/i.test(option.lang));
  const preferred = englishVoices.find(option => /natural|neural|premium/i.test(option.name))
    ?? englishVoices.find(option => /enhanced|google/i.test(option.name))
    ?? englishVoices.find(option => option.default);
  if (preferred) {
    utterance.voice = preferred;
    utterance.lang = preferred.lang;
  }
  utterance.rate = 0.9;
  utterance.volume = 1;
  utterance.onend = finish;
  utterance.onerror = finish;
  voice.speak(utterance);
}

get('mute').onchange = () => {
  if (get('mute').checked && speech) {
    speech.onend();
    voice.cancel();
  }
};

const tacticLabels = {
  government_impersonation: 'fake authority',
  legal_threat: 'threat',
  handoff_to_authority: 'handoff to authority',
};

function updateHighlights(run) {
  const text = run.liveText;
  const live = get('live');
  const fragment = document.createDocumentFragment();
  const shown = new Set();
  const matches = phraseMatches(text, run.flags.values());
  const boundaries = [...new Set([0, text.length, ...matches.flatMap(match => [match.start, match.end])])].sort((a, b) => a - b);
  for (let i = 1; i < boundaries.length; i++) {
    const start = boundaries[i - 1];
    const end = boundaries[i];
    const active = matches.filter(match => match.start <= start && match.end >= end);
    let element = document.createTextNode(text.slice(start, end));
    for (const match of active) {
      const id = JSON.stringify(match);
      const mark = document.createElement('mark');
      if (!run.shown.has(id) && !shown.has(id)) mark.classList.add('highlight-new');
      shown.add(id);
      mark.append(element);
      if (match.end === end) {
        const label = document.createElement('small');
        label.textContent = tacticLabels[match.tactic] ?? match.tactic.replaceAll('_', ' ');
        mark.append(label);
      }
      element = mark;
    }
    fragment.append(element);
  }
  live.replaceChildren(fragment);
  live.scrollTop = live.scrollHeight;
  run.shown = shown;
}

function list(id, items) {
  get(id).replaceChildren(...items.map(item => {
    const li = document.createElement('li');
    li.textContent = item;
    return li;
  }));
}

function render(result) {
  get('score').textContent = result.risk ?? '—';
  get('meter').value = result.risk ?? 0;
  get('meter').classList.toggle('high-risk', (result.risk ?? 0) >= 75);
  get('reason').textContent = result.reason || 'No score yet.';
  list('tactics', result.tactics.map(label => label.replaceAll('_', ' ')));
  list('signal-list', result.legit_signals);
  get('signals').hidden = !result.legit_signals.length;
}

function stop() {
  const previous = session;
  session = null;
  if (previous) {
    clearInterval(previous.timer);
    clearTimeout(previous.resumeVoice);
    if (voiceRun === previous) {
      speech = null;
      voiceRun = null;
      voice?.cancel();
    }
    previous.controller.abort();
    previous.cleanup?.();
  }
  get('stop').disabled = true;
  get('play').disabled = false;
  get('listen').disabled = false;
  get('status').textContent = 'Stopped';
  get('listening').hidden = true;
}

const sampleScam = 'This is your bank’s fraud department.\nYour account will be frozen unless you act now.\nRead me the verification code we just sent you.';
const sampleOrdinary = 'Hello, this is a routine reminder from your dental office.\nYour appointment is Tuesday at ten in the morning.\nIf you need to reschedule, call the number on your appointment card.';
const audioTranscript = 'Hello. This is Officer Morgan calling from the Social Security office. We found suspicious activity associated with your account. If you hang up, we will issue a warrant for your arrest. You need to act now. Stay on the line and don’t tell anyone about this call. Go to the nearest store and buy a gift card. Then read the number on the back to me. If the store asks, say the card is for a friend. You have ten minutes to clear this up.\nI need to verify this. I’m going to hang up and call the office myself.';

function showDiagnostic(error) {
  console.error(error);
  get('diagnostic-message').textContent = String(error);
  get('diagnostics').hidden = false;
}

function clearResult() {
  get('diagnostics').hidden = true;
  get('diagnostics').open = false;
  get('diagnostic-message').textContent = '';
  if (alert.open) alert.close();
  get('alert-evidence').textContent = '';
  get('alert-evidence').hidden = true;
  get('source').hidden = true;
  get('live').textContent = 'The transcript will appear here.';
  render({risk: null, reason: 'Nothing to check yet. Quiet is good.', tactics: [], legit_signals: []});
}

function evidenceFor(transcript, flags) {
  const matches = phraseMatches(transcript, flags);
  const match = matches.find(item => item.tactic === 'sensitive_info_request')
    ?? matches.find(item => ['payment_request', 'remote_access', 'legal_threat'].includes(item.tactic))
    ?? matches[0];
  if (!match) return '';
  const before = transcript.slice(0, match.start);
  const after = transcript.slice(match.end);
  const start = Math.max(...['.', '!', '?', '\n'].map(delimiter => before.lastIndexOf(delimiter))) + 1;
  const end = after.search(/[.!?\n]/);
  return transcript.slice(start, end < 0 ? undefined : match.end + end + 1).trim();
}

function scanText(transcript, source) {
  unlockVoice();
  const run = start(() => transcript, false);
  run.liveText = transcript;
  updateHighlights(run);
  get('source').textContent = source;
  get('source').hidden = false;
  check(run).finally(() => {
    if (session === run) get('stop').disabled = true;
  });
}

const onboardingKey = 'scam-shield-walkthrough-v1-complete';
let onboardingComplete = false;
try {
  onboardingComplete = localStorage.getItem(onboardingKey) === 'true';
} catch {
  // The app still works when browser storage is unavailable.
}
get('onboarding').hidden = onboardingComplete;
get('app').hidden = !onboardingComplete;

function completeOnboarding(destination) {
  try {
    localStorage.setItem(onboardingKey, 'true');
  } catch {
    // Continue to the app even if the browser cannot save this preference.
  }
  get('onboarding').hidden = true;
  get('app').hidden = false;
  get(destination).focus();
}

const steps = [...get('walkthrough-steps').children];
let currentStep = 0;

function showStep(index) {
  currentStep = index;
  const finalStep = index === steps.length - 1;
  steps.forEach((step, i) => { step.hidden = i !== index; });
  get('walkthrough-progress').textContent = `Step ${index + 1} of ${steps.length}`;
  get('welcome-title').textContent = steps[index].dataset.title;
  get('walkthrough-back').hidden = index === 0;
  get('walkthrough-demo').hidden = !finalStep;
  get('get-started').textContent = finalStep ? 'Open Scam Shield' : 'Next';
  get('welcome-title').focus();
}

get('get-started').onclick = () => {
  if (currentStep === steps.length - 1) completeOnboarding('app-title');
  else showStep(currentStep + 1);
};
get('walkthrough-back').onclick = () => showStep(currentStep - 1);
get('welcome-mute').onchange = () => {
  get('mute').checked = get('welcome-mute').checked;
  get('test-voice').disabled = get('mute').checked;
  get('mute').onchange();
};
get('test-voice').onclick = () => {
  if (voice) speakWarning();
  else {
    get('voice-status').textContent = 'Voice playback is unavailable in this browser.';
    get('voice-status').hidden = false;
  }
};
for (const [demo, sample] of [['demo-scam', 'sample-scam'], ['demo-ordinary', 'sample-ordinary']]) {
  get(demo).onclick = () => {
    completeOnboarding('samples');
    get(sample).click();
  };
}

get('sample-scam').onclick = () => scanText(sampleScam, 'Synthetic scam · bundled transcript');
get('sample-ordinary').onclick = () => scanText(sampleOrdinary, 'Ordinary appointment reminder · bundled transcript');
get('reset').onclick = () => {
  stop();
  if (speech) {
    speech = null;
    voice?.cancel();
  }
  clearResult();
  get('paste').value = '';
  get('status').textContent = '';
};

function start(transcript, live = true) {
  stop();
  clearResult();
  get('status').textContent = '';
  const run = {transcript, controller: new AbortController(), alerted: false, flags: new Map(), shown: new Set(), liveText: ''};
  session = run;
  get('stop').disabled = false;
  if (live) run.timer = setInterval(() => {
    if (!run.busy) run.pending = check(run);
  }, 4000);
  return run;
}

async function check(run) {
  if (run.busy || run.voicePaused || session !== run) return;
  const transcript = run.transcript().trim();
  if (!transcript) return;
  run.busy = true;
  get('status').textContent = 'Analyzing transcript…';
  const voiceGeneration = run.voiceGeneration;
  try {
    const response = await fetch('/api/check', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({transcript}), signal: run.controller.signal,
    });
    const data = await response.json();
    if (session !== run || run.voiceGeneration !== voiceGeneration) return;
    if (!response.ok) throw new Error(data.error);
    for (const flag of data.flagged_phrases) {
      const key = flag.phrase.trim().toLowerCase();
      if (!run.flags.has(key)) run.flags.set(key, flag);
    }
    if (run.liveText && !run.voicePaused) updateHighlights(run);
    const result = score(data, transcript);
    render(result);
    get('status').textContent = ({scam: 'Suspicious tactics detected', suspicious: 'Suspicious tactics detected', likely_safe: 'Sounds fine. They asked for nothing and didn’t rush you.'})[data.verdict];
    if (result.risk < 75) run.alerted = false;
    if (result.risk >= 75 && !run.alerted) {
      run.alerted = true;
      const evidence = evidenceFor(transcript, data.flagged_phrases);
      get('alert-evidence').textContent = evidence;
      get('alert-evidence').hidden = !evidence;
      get('alert-reason').textContent = result.reason;
      get('alert-action').textContent = /\b(?:verification|security|one[- ]time) code\b/i.test(evidence)
        ? 'Hang up and contact the organization through its official app or a number you already trust.'
        : 'Hang up and call back on a number you trust.';
      if (!alert.open) {
        alert.showModal();
        speakWarning();
      }
    }
  } catch (error) {
    if (session !== run || run.voiceGeneration !== voiceGeneration) return;
    showDiagnostic(error);
    render({risk: null, reason: 'Shield couldn’t check this transcript.', tactics: [], legit_signals: []});
    get('status').textContent = 'Try again in a moment.';
  } finally {
    run.busy = false;
  }
}

get('analyze').onclick = () => {
  unlockVoice();
  const transcript = get('paste').value.trim();
  if (!transcript) {
    get('status').textContent = 'Paste a transcript first.';
    get('paste').focus();
    return;
  }
  scanText(transcript, 'Pasted transcript');
};
get('stop').onclick = stop;

get('play').onclick = () => listen(false);
get('listen').onclick = () => listen(true);

async function listen(microphone) {
  unlockVoice();
  const words = [];
  let interim = [];
  let history = '';
  let finishedAt;
  let failed = false;
  const audio = microphone ? null : new Audio('/sample.wav');
  let micTime = 0;
  let stopMic;
  const windowText = () => {
    const cutoff = (finishedAt ?? (microphone ? micTime : audio.currentTime)) - 30;
    return [...words, ...interim].filter(word => word.end >= cutoff)
      .map(word => word.punctuated_word ?? word.word).join(' ');
  };
  const run = start(windowText);
  run.microphone = microphone;
  render({risk: null, tactics: [], legit_signals: []});
  get('play').disabled = true;
  get('listen').disabled = true;
  get('live').textContent = '';
  get('status').textContent = 'Connecting to live transcription…';
  get('listening').hidden = true;
  let stream;
  let context;
  if (microphone) {
    get('status').textContent = 'Waiting for microphone permission…';
    try {
      context = new AudioContext({sampleRate: 16000});
      run.controller.signal.addEventListener('abort', () => context.close().catch(() => {}), {once: true});
      context.resume().catch(() => {});
      stream = await openMicrophone(run);
      if (session !== run) return;
      get('status').textContent = 'Connecting to live transcription…';
    } catch (error) {
      if (session === run) {
        stop();
        showDiagnostic(error);
        get('status').textContent = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error.name)
          ? 'Shield can’t hear anything without the microphone. You can still paste what the caller said.'
          : 'Shield couldn’t start the microphone. You can still paste what the caller said.';
      }
      return;
    }
  }
  const socket = new WebSocket(new URL('/api/listen', location.href.replace(/^http/, 'ws')));
  let pump;
  run.cleanup = () => {
    clearInterval(pump);
    audio?.pause();
    stopMic?.();
    socket.close();
  };
  function fail(message) {
    if (session !== run) return;
    failed = true;
    if (!microphone) {
      scanText(audioTranscript, 'Shield couldn’t hear the sample. Checking the written version.');
      showDiagnostic(message);
      return;
    }
    stop();
    showDiagnostic(message);
    get('status').textContent = 'Shield lost the audio. Try listening again, or paste what the caller said.';
  }

  socket.onerror = () => fail('Live transcription connection failed.');
  socket.onclose = async () => {
    if (!failed && session === run) {
      if (finishedAt === undefined) {
        fail('Live transcription disconnected before the call ended.');
      } else {
        if (!windowText()) return fail('No transcript received.');
        clearInterval(run.timer);
        await run.pending;
        if (session !== run) return;
        await check(run);
        if (session !== run) return;
        get('play').disabled = false;
        get('listen').disabled = false;
        get('stop').disabled = true;
        get('status').textContent = 'Sample call complete. ' + get('status').textContent;
      }
    }
  };
  socket.onmessage = async event => {
    if (session !== run) return;
    const message = JSON.parse(event.data);
    if (message.error) return fail(message.error);
    if (message.ready && microphone) {
      try {
        stopMic = await streamMicrophone(stream, context, socket, run, time => { micTime = time; });
        if (session !== run) return stopMic();
        get('listening').hidden = false;
        get('status').textContent = 'Monitoring microphone';
      } catch (error) {
        fail(error.message || 'Could not start the microphone.');
      }
    }
    if (message.ready && !microphone) {
      try {
        const response = await fetch('/sample.wav', {signal: run.controller.signal});
        if (!response.ok) throw new Error('Audio unavailable');
        const wav = await response.arrayBuffer();
        const view = new DataView(wav);
        let offset = 12;
        while (offset + 8 <= wav.byteLength && view.getUint32(offset) !== 0x64617461) {
          const size = view.getUint32(offset + 4, true);
          offset += 8 + size + (size % 2);
        }
        const length = view.getUint32(offset + 4, true);
        const pcm = new Uint8Array(wav, offset + 8, length);
        if (session !== run) return;
        await audio.play();
        if (session !== run) return audio.pause();
        get('status').textContent = 'Listening to sample call…';
        let sent = 0;
        const stream = () => {
          const target = audio.ended ? pcm.length : Math.min(pcm.length, Math.floor(audio.currentTime * 16000) * 2);
          while (sent < target && socket.readyState === WebSocket.OPEN) {
            const end = Math.min(target, sent + 6400);
            socket.send(pcm.subarray(sent, end));
            sent = end;
          }
          if (audio.ended && finishedAt === undefined) {
            finishedAt = audio.duration;
            clearInterval(pump);
            if (socket.readyState === WebSocket.OPEN) socket.send('end');

          }
        };
        audio.onended = stream;
        pump = setInterval(stream, 100);
      } catch {
        fail('Could not play the bundled audio.');
      }
    }
    if (message.type === 'Results' && !run.voicePaused) {
      const alternative = message.channel.alternatives[0];
      interim = alternative.words ?? [];
      let partial = alternative.transcript;
      if (message.is_final) {
        words.push(...interim);
        history = [history, partial].filter(Boolean).join('\n');
        partial = '';
        interim = [];
      }
      run.liveText = [history, partial].filter(Boolean).join('\n');
      updateHighlights(run);
    }
  };
}

async function openMicrophone(run) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access requires HTTPS or localhost.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({audio: {
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: true,
  }});
  const stopTracks = () => stream.getTracks().forEach(track => track.stop());
  if (run.controller.signal.aborted) stopTracks();
  else run.controller.signal.addEventListener('abort', stopTracks, {once: true});
  return stream;
}

async function streamMicrophone(stream, context, socket, run, onTime) {
  if (run.controller.signal.aborted) return () => {};
  let wakeLock;
  let stopped = false;
  let requestingLock = false;
  async function keepScreenAwake() {
    if (!navigator.wakeLock || document.hidden || stopped || requestingLock ||
        (wakeLock && !wakeLock.released)) return;
    requestingLock = true;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      if (stopped) await wakeLock.release();
    } catch {
      // An unavailable screen lock does not interrupt transcription.
    } finally {
      requestingLock = false;
    }
  }
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    document.removeEventListener('visibilitychange', keepScreenAwake);
    wakeLock?.release().catch(() => {});
  };
  run.controller.signal.addEventListener('abort', cleanup, {once: true});
  try {
    await context.audioWorklet.addModule('/mic.js');
    if (stopped) return cleanup;
    const source = context.createMediaStreamSource(stream);
    const recorder = new AudioWorkletNode(context, 'mic-pcm');
    let seconds = 0;
    recorder.port.onmessage = ({data}) => {
      if (stopped || socket.readyState !== WebSocket.OPEN) return;
      socket.send(run.voicePaused ? new ArrayBuffer(data.byteLength) : data);
      seconds += 0.25;
      onTime(seconds);
    };
    source.connect(recorder).connect(context.destination);
    await context.resume();
    if (!stopped) {
      document.addEventListener('visibilitychange', keepScreenAwake);
      keepScreenAwake();
    }
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
