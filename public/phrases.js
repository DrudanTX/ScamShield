const separator = '[\\s\\p{P}]+';
const punctuation = '\\p{P}*';

export function phraseMatches(text, flags) {
  const matches = [];
  for (const {phrase, tactic} of flags) {
    const words = phrase.match(/[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/gu);
    if (!words?.length) continue;
    const pattern = words.map(word => Array.from(word.replace(/['’]/g, '')).join(punctuation)).join(separator);
    const regex = new RegExp('(?<![\\p{L}\\p{N}\\p{M}])' + pattern + '(?![\\p{L}\\p{N}\\p{M}])', 'giu');
    for (const match of text.matchAll(regex)) {
      matches.push({start: match.index, end: match.index + match[0].length, tactic});
    }
  }
  return matches.sort((a, b) => a.start - b.start || b.end - a.end);
}
