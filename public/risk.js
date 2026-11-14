const keywords = [/\bgift cards?\b/i, /\bwire\b/i, /\bdon['’]?t tell anyone\b/i, /\bsocial security\b/i, /\barrest\b/i];

export function keywordBoost(transcript) {
  return Math.min(10, keywords.filter(pattern => pattern.test(transcript)).length * 2);
}

export function score(result, transcript) {
  return {...result, risk: Math.min(100, result.risk + keywordBoost(transcript))};
}
