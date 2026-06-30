/**
 * json.ts — shared JSON extraction for LLM judge responses.
 *
 * Both judges ask the model for "JSON only" but models still wrap it in prose or
 * ```json fences. This strips a fence if present, then slices the outermost
 * {...} and parses. One helper, used by narrative_judge and fabrication.
 */

/** Extract and parse the outermost JSON object from a (possibly fenced/prose-wrapped) string. */
export function extractJsonObject(text: string): any {
  let cleaned = (text ?? '').trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const fb = cleaned.indexOf('{');
  const lb = cleaned.lastIndexOf('}');
  if (fb !== -1 && lb > fb) cleaned = cleaned.slice(fb, lb + 1);
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    return JSON.parse(repairJsonish(cleaned));
  }
}

function repairJsonish(input: string): string {
  return escapeControlCharsInStrings(input).replace(/,\s*([}\]])/g, '$1');
}

function escapeControlCharsInStrings(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      out += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      out += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      out += char;
      continue;
    }
    if (inString) {
      if (char === '\n') {
        out += '\\n';
        continue;
      }
      if (char === '\r') {
        out += '\\r';
        continue;
      }
      if (char === '\t') {
        out += '\\t';
        continue;
      }
      const code = char.charCodeAt(0);
      if (code < 0x20) {
        out += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
    }
    out += char;
  }

  return out;
}
