/**
 * JSON Schemas for every structured AI response, plus runtime validators.
 *
 * The schema is enforced by the API (`output_config.format`), and the validator
 * re-checks the semantics the schema cannot express -- an option index that
 * points past the end of the options array, a concept name that was never in
 * the input list, an empty card. Belt and braces, because this data goes
 * straight into a student's study material.
 */

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

export const NOTE_BLOCK_TYPES = [
  'heading', 'paragraph', 'bullet', 'numbered', 'definition',
  'example', 'callout', 'key_fact', 'formula', 'quote', 'summary',
] as const;

export const notesSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A specific title for this material, not a generic one.' },
    summary: { type: 'string', description: 'Two or three sentences on what this material covers.' },
    language: { type: 'string', description: 'BCP-47 code of the language you wrote in, e.g. pt-BR.' },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: NOTE_BLOCK_TYPES },
          level: { type: ['integer', 'null'], description: 'Heading level 1-4, else null.' },
          term: { type: ['string', 'null'], description: 'For definition blocks: the term.' },
          content: { type: 'string' },
          origin: { type: 'string', enum: ['source', 'ai'] },
          source_ref: {
            type: 'object',
            properties: {
              segment_ids: { type: 'array', items: { type: 'string' } },
              page: { type: ['integer', 'null'] },
            },
            required: ['segment_ids', 'page'],
            additionalProperties: false,
          },
        },
        required: ['type', 'level', 'term', 'content', 'origin', 'source_ref'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'summary', 'language', 'blocks'],
  additionalProperties: false,
} as const;

export type GeneratedNotes = {
  title: string;
  summary: string;
  language: string;
  blocks: {
    type: (typeof NOTE_BLOCK_TYPES)[number];
    level: number | null;
    term: string | null;
    content: string;
    origin: 'source' | 'ai';
    source_ref: { segment_ids: string[]; page: number | null };
  }[];
};

/* -------------------------------------------------------------------------- */
/* Document extraction                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Page-aware extraction. Competitors flatten a PDF to raw text and lose the
 * diagrams, which is one of the most-reported gaps in this category. Claude
 * reads the rendered page, so a figure caption stays attached to the figure and
 * a table keeps its shape.
 */
export const documentSchema = {
  type: 'object',
  properties: {
    language: { type: 'string' },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          page_number: { type: 'integer' },
          text: { type: 'string', description: 'The readable prose of the page, in reading order.' },
          headings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                level: { type: 'integer' },
                text: { type: 'string' },
              },
              required: ['level', 'text'],
              additionalProperties: false,
            },
          },
          tables: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                caption: { type: 'string' },
                rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
              },
              required: ['caption', 'rows'],
              additionalProperties: false,
            },
          },
          figures: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                caption: { type: 'string' },
                // What the figure actually shows, so it is searchable and can be
                // reasoned about later even though we do not store the bitmap.
                description: { type: 'string' },
              },
              required: ['caption', 'description'],
              additionalProperties: false,
            },
          },
        },
        required: ['page_number', 'text', 'headings', 'tables', 'figures'],
        additionalProperties: false,
      },
    },
  },
  required: ['language', 'pages'],
  additionalProperties: false,
} as const;

export type ExtractedDocument = {
  language: string;
  pages: {
    page_number: number;
    text: string;
    headings: { level: number; text: string }[];
    tables: { caption: string; rows: string[][] }[];
    figures: { caption: string; description: string }[];
  }[];
};

/* -------------------------------------------------------------------------- */
/* Concepts                                                                   */
/* -------------------------------------------------------------------------- */

export const CONCEPT_RELATIONS = [
  'related', 'prerequisite_of', 'part_of', 'causes', 'contrasts_with', 'example_of',
] as const;

export const conceptsSchema = {
  type: 'object',
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          definition: { type: ['string', 'null'] },
          importance: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        },
        required: ['name', 'definition', 'importance'],
        additionalProperties: false,
      },
    },
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Concept name, exactly as listed above.' },
          to: { type: 'string' },
          relation: { type: 'string', enum: CONCEPT_RELATIONS },
        },
        required: ['from', 'to', 'relation'],
        additionalProperties: false,
      },
    },
  },
  required: ['concepts', 'links'],
  additionalProperties: false,
} as const;

export type GeneratedConcepts = {
  concepts: { name: string; definition: string | null; importance: number }[];
  links: { from: string; to: string; relation: (typeof CONCEPT_RELATIONS)[number] }[];
};

/* -------------------------------------------------------------------------- */
/* Flashcards                                                                 */
/* -------------------------------------------------------------------------- */

export const flashcardsSchema = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          front: { type: 'string' },
          back: { type: 'string' },
          explanation: { type: 'string' },
          tier: { type: 'string', enum: ['intro', 'core', 'advanced'] },
          concept_name: { type: 'string' },
          source_ref: {
            type: 'object',
            properties: {
              segment_ids: { type: 'array', items: { type: 'string' } },
              page: { type: ['integer', 'null'] },
            },
            required: ['segment_ids', 'page'],
            additionalProperties: false,
          },
        },
        required: ['front', 'back', 'explanation', 'tier', 'concept_name', 'source_ref'],
        additionalProperties: false,
      },
    },
  },
  required: ['cards'],
  additionalProperties: false,
} as const;

export type GeneratedCards = {
  cards: {
    front: string;
    back: string;
    explanation: string;
    tier: 'intro' | 'core' | 'advanced';
    concept_name: string;
    source_ref: { segment_ids: string[]; page: number | null };
  }[];
};

/* -------------------------------------------------------------------------- */
/* Quiz                                                                       */
/* -------------------------------------------------------------------------- */

export const quizSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['multiple_choice', 'true_false', 'short_answer', 'matching'],
          },
          prompt: { type: 'string' },
          // Union of every shape: index list for MC, {left,right} for matching,
          // empty for the rest. JSON Schema cannot express the dependency, so
          // validateQuiz() checks it after parsing.
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'multiple_choice: the four options. matching: the LEFT column. Otherwise empty.',
          },
          options_right: {
            type: 'array',
            items: { type: 'string' },
            description: 'matching only: the RIGHT column. Otherwise empty.',
          },
          answer_index: { type: ['integer', 'null'], description: 'multiple_choice only.' },
          answer_boolean: { type: ['boolean', 'null'], description: 'true_false only.' },
          answer_text: {
            type: 'array',
            items: { type: 'string' },
            description: 'short_answer only: accepted answers.',
          },
          answer_pairs: {
            type: 'array',
            items: { type: 'array', items: { type: 'integer' } },
            description: 'matching only: [leftIndex, rightIndex] pairs.',
          },
          explanation: { type: 'string' },
          tier: { type: 'string', enum: ['intro', 'core', 'advanced'] },
          concept_name: { type: 'string' },
        },
        required: [
          'type', 'prompt', 'options', 'options_right', 'answer_index',
          'answer_boolean', 'answer_text', 'answer_pairs', 'explanation',
          'tier', 'concept_name',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

export type GeneratedQuestion = {
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'matching';
  prompt: string;
  options: string[];
  options_right: string[];
  answer_index: number | null;
  answer_boolean: boolean | null;
  answer_text: string[];
  answer_pairs: number[][];
  explanation: string;
  tier: 'intro' | 'core' | 'advanced';
  concept_name: string;
};

export type GeneratedQuiz = { questions: GeneratedQuestion[] };

/* -------------------------------------------------------------------------- */
/* Grading                                                                    */
/* -------------------------------------------------------------------------- */

export const gradingSchema = {
  type: 'object',
  properties: {
    correct: { type: 'boolean' },
    note: { type: 'string' },
  },
  required: ['correct', 'note'],
  additionalProperties: false,
} as const;

export type GradingResult = { correct: boolean; note: string };

/* -------------------------------------------------------------------------- */
/* Exam plan                                                                  */
/* -------------------------------------------------------------------------- */

export const examPlanSchema = {
  type: 'object',
  properties: {
    note: {
      type: ['string', 'null'],
      description: 'An honest caveat, e.g. that the time available is too short.',
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day_offset: { type: 'integer', description: '0 = today, 1 = tomorrow.' },
          kind: { type: 'string', enum: ['review', 'flashcards', 'quiz', 'read', 'drill'] },
          title: { type: 'string' },
          concept_names: { type: 'array', items: { type: 'string' } },
          estimated_minutes: { type: 'integer' },
          priority: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        },
        required: ['day_offset', 'kind', 'title', 'concept_names', 'estimated_minutes', 'priority'],
        additionalProperties: false,
      },
    },
  },
  required: ['note', 'items'],
  additionalProperties: false,
} as const;

export type GeneratedPlan = {
  note: string | null;
  items: {
    day_offset: number;
    kind: 'review' | 'flashcards' | 'quiz' | 'read' | 'drill';
    title: string;
    concept_names: string[];
    estimated_minutes: number;
    priority: number;
  }[];
};

/* -------------------------------------------------------------------------- */
/* Validators                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Drops questions that are internally inconsistent rather than failing the
 * whole generation. One bad question should not cost the student their quiz.
 * Returns the survivors and a count of what was dropped, which is logged.
 */
export function validateQuiz(
  quiz: GeneratedQuiz,
  knownConcepts: Set<string>,
): { questions: GeneratedQuestion[]; dropped: number } {
  const kept = quiz.questions.filter((q) => {
    if (!q.prompt?.trim() || !q.explanation?.trim()) return false;

    switch (q.type) {
      case 'multiple_choice':
        return (
          q.options.length >= 2 &&
          q.answer_index !== null &&
          q.answer_index >= 0 &&
          q.answer_index < q.options.length &&
          new Set(q.options).size === q.options.length
        );
      case 'true_false':
        return q.answer_boolean !== null;
      case 'short_answer':
        return q.answer_text.length > 0 && q.answer_text.every((a) => a.trim().length > 0);
      case 'matching':
        return (
          q.options.length >= 2 &&
          q.options_right.length >= 2 &&
          q.answer_pairs.length > 0 &&
          q.answer_pairs.every(
            ([l, r]) =>
              typeof l === 'number' && typeof r === 'number' &&
              l >= 0 && l < q.options.length &&
              r >= 0 && r < q.options_right.length,
          )
        );
      default:
        return false;
    }
  });

  // A concept name we do not recognise becomes an unlinked question rather than
  // a dropped one -- the question may still be good.
  for (const q of kept) {
    if (!knownConcepts.has(q.concept_name)) q.concept_name = '';
  }

  return { questions: kept, dropped: quiz.questions.length - kept.length };
}

/** Drops empty or degenerate cards (front identical to back, etc.). */
export function validateCards(
  generated: GeneratedCards,
  knownConcepts: Set<string>,
): { cards: GeneratedCards['cards']; dropped: number } {
  const kept = generated.cards.filter((c) => {
    if (!c.front?.trim() || !c.back?.trim()) return false;
    if (c.front.trim().toLowerCase() === c.back.trim().toLowerCase()) return false;
    // A "card" that restates the question as the answer teaches nothing.
    if (c.back.trim().length < 2) return false;
    return true;
  });

  for (const c of kept) {
    if (!knownConcepts.has(c.concept_name)) c.concept_name = '';
  }

  return { cards: kept, dropped: generated.cards.length - kept.length };
}
