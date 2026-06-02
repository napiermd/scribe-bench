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
  return JSON.parse(cleaned);
}
