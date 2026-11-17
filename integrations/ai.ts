import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

export function isAiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

export interface AiBatchDraftInput {
  batchTitle: string;
  projectName: string;
  clientName: string;
  criteria: Array<{
    id: string;
    title: string;
    category: string;
    status: string;
  }>;
  evidence: Array<{
    id: string;
    title: string;
    observationType: string;
    claimAttribution: string;
    state: string;
    commitSha: string | null;
    testedSha: string | null;
  }>;
}

export interface AiDraftResult {
  provider: 'gemini' | 'deterministic_fallback';
  model: string;
  draftText: string;
  suggestedMappings: Array<{
    criterionId: string;
    evidenceId: string;
    rationale: string;
  }>;
}

function buildDeterministicFallback(input: AiBatchDraftInput): AiDraftResult {
  const verifiedCriteria = input.criteria.filter((c) => c.status === 'verified');
  const openCriteria = input.criteria.filter(
    (c) => c.status !== 'verified' && c.status !== 'not_applicable'
  );

  const evidenceSummary =
    input.evidence.length > 0
      ? input.evidence
          .slice(0, 6)
          .map(
            (ev) =>
              `[${ev.id}] ${ev.title} (${ev.observationType}, state: ${ev.state}${ev.commitSha ? `, sha: ${ev.commitSha.slice(0, 7)}` : ''})`
          )
          .join('; ')
      : 'No engineering observations attached yet.';

  const lines: string[] = [
    `[Agency Statement — Draft] Delivery summary for ${input.clientName} (${input.projectName}) — ${input.batchTitle}.`,
    `Recorded ${input.criteria.length} acceptance criteria (${verifiedCriteria.length} verified, ${openCriteria.length} awaiting verification or containing gaps).`,
    `Referenced evidence observations: ${evidenceSummary}`,
  ];

  if (openCriteria.length > 0) {
    lines.push(
      `[Agency Statement — Draft] Open items requiring disclosure or review before client sign-off: ${openCriteria
        .map((c) => c.title)
        .join(', ')}.`
    );
  }

  const suggestedMappings: AiDraftResult['suggestedMappings'] = [];
  for (const criterion of input.criteria) {
    const tokens = criterion.title
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    for (const ev of input.evidence) {
      const evText = ev.title.toLowerCase();
      const matched = tokens.find((t) => evText.includes(t));
      if (matched) {
        suggestedMappings.push({
          criterionId: criterion.id,
          evidenceId: ev.id,
          rationale: `Keyword match on '${matched}' between criterion and observation title.`,
        });
      }
    }
  }

  return {
    provider: 'deterministic_fallback',
    model: 'deterministic-template-v1',
    draftText: lines.join('\n\n'),
    suggestedMappings: suggestedMappings.slice(0, 8),
  };
}

export async function generateDeliverySummaryDraft(
  input: AiBatchDraftInput
): Promise<AiDraftResult> {
  if (!isAiConfigured()) {
    return buildDeterministicFallback(input);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Metadata-only payload: never send source code, secrets, or internal notes.
    const safePayload = {
      batchTitle: input.batchTitle,
      projectName: input.projectName,
      clientName: input.clientName,
      criteria: input.criteria.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        status: c.status,
      })),
      evidence: input.evidence.map((e) => ({
        id: e.id,
        title: e.title,
        observationType: e.observationType,
        claimAttribution: e.claimAttribution,
        state: e.state,
        commitSha: e.commitSha ? e.commitSha.slice(0, 10) : null,
      })),
    };

    const timeoutMs = 12000;
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Draft a concise client-facing delivery summary and suggest criterion-to-evidence mappings from this metadata JSON:\n${JSON.stringify(safePayload)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You draft delivery summaries for software agency clients. Strict rules: (1) Never invent features, test results, deployments, outcomes, or client acceptance. (2) Every factual claim must cite exact evidence IDs in brackets like [ev_123] or be prefixed with "[Agency Statement — Draft]". (3) Mention any failed, stale, or pending states transparently. Keep draftText under 180 words.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              draftText: { type: Type.STRING },
              suggestedMappings: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    criterionId: { type: Type.STRING },
                    evidenceId: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini draft request timed out')), timeoutMs)
      ),
    ]);

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      draftText?: string;
      suggestedMappings?: Array<{
        criterionId: string;
        evidenceId: string;
        rationale: string;
      }>;
    };

    if (!parsed.draftText) {
      return buildDeterministicFallback(input);
    }

    return {
      provider: 'gemini',
      model: 'gemini-4-hydrogen',
      draftText: parsed.draftText,
      suggestedMappings: parsed.suggestedMappings ?? [],
    };
  } catch {
    return buildDeterministicFallback(input);
  }
}
