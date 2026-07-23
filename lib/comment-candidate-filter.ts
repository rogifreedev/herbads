const DIRECT_QUESTION_START = /^(?:wie|was|wo|wann|welch(?:e|er|es|en)|kann|koennte|könnte|gibt|ist|sind|hat|haben|kostet|funktioniert|passt|liefert|versendet|come|cosa|dove|quando|qual(?:e|i)|quanto|posso|potete|avete|costa|funziona|consegnate|spedite|how|what|where|when|which|can|could|do|does|is|are|have|has|costs|ships?)\b/i;

const LOW_VALUE_PRODUCT_QUESTION = [
  /\b(?:wie viel|wieviel|was kostet|welcher preis|preis|kosten|rabatt|gutschein|coupon)\b/i,
  /\b(?:versand|liefer(?:ung|zeit|t|n)?|verschick(?:t|en)?|verfügbar|verfuegbar|auf lager|bestell(?:en|ung)?|kauf(?:en)?|wo gibt es)\b/i,
  /\b(?:wie (?:wende|benutze|nutze)|anwendung|dosierung|größe|groesse|farbe|variante|kontakt|kundenservice|support)\b/i,
  /\b(?:quanto costa|prezzo|sconto|spedizione|consegna|disponibile|disponibilità|ordinare|acquistare|come si usa|dosaggio|taglia|colore|assistenza)\b/i,
  /\b(?:how much|price|discount|coupon|shipping|delivery|available|availability|in stock|order|buy|how (?:do|can) (?:i|we) use|dosage|size|colo(?:u)?r|customer service|support)\b/i
];

export function isLikelyLowValueProductQuestion(message: string) {
  const normalized = message.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized) return false;

  const looksLikeQuestion = /[?？]/.test(normalized) || DIRECT_QUESTION_START.test(normalized);
  return looksLikeQuestion && LOW_VALUE_PRODUCT_QUESTION.some((pattern) => pattern.test(normalized));
}
