// Generated from the live Vela schema via the Supabase MCP server.
// Do not edit by hand: re-generate after every migration.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          app_version: string | null
          created_at: string
          id: number
          name: string
          platform: string | null
          props: Json
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: number
          name: string
          platform?: string | null
          props?: Json
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: number
          name?: string
          platform?: string | null
          props?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      card_states: {
        Row: {
          card_id: string
          difficulty: number
          due: string
          elapsed_days: number
          lapses: number
          last_review: string | null
          learning_steps: number
          reps: number
          scheduled_days: number
          stability: number
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          difficulty?: number
          due?: string
          elapsed_days?: number
          lapses?: number
          last_review?: string | null
          learning_steps?: number
          reps?: number
          scheduled_days?: number
          stability?: number
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          difficulty?: number
          due?: string
          elapsed_days?: number
          lapses?: number
          last_review?: string | null
          learning_steps?: number
          reps?: number
          scheduled_days?: number
          stability?: number
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_states_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "flashcards"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          citations: Json
          content: string
          created_at: string
          id: string
          input_tokens: number | null
          output_tokens: number | null
          role: string
          thread_id: string
          ungrounded: boolean
          user_id: string
        }
        Insert: {
          citations?: Json
          content: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          role: string
          thread_id: string
          ungrounded?: boolean
          user_id: string
        }
        Update: {
          citations?: Json
          content?: string
          created_at?: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          role?: string
          thread_id?: string
          ungrounded?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          mode: string
          source_id: string | null
          space_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          source_id?: string | null
          space_id: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          source_id?: string | null
          space_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_links: {
        Row: {
          created_at: string
          from_concept: string
          id: string
          relation: string
          to_concept: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          from_concept: string
          id?: string
          relation?: string
          to_concept: string
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          from_concept?: string
          id?: string
          relation?: string
          to_concept?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "concept_links_from_concept_fkey"
            columns: ["from_concept"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_links_to_concept_fkey"
            columns: ["to_concept"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_mentions: {
        Row: {
          concept_id: string
          created_at: string
          id: string
          note_block_id: string | null
          source_id: string | null
          user_id: string
        }
        Insert: {
          concept_id: string
          created_at?: string
          id?: string
          note_block_id?: string | null
          source_id?: string | null
          user_id: string
        }
        Update: {
          concept_id?: string
          created_at?: string
          id?: string
          note_block_id?: string | null
          source_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_mentions_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_mentions_note_block_id_fkey"
            columns: ["note_block_id"]
            isOneToOne: false
            referencedRelation: "note_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_mentions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          created_at: string
          definition: string | null
          first_source_id: string | null
          id: string
          importance: number
          mastery: number
          mastery_updated_at: string | null
          name: string
          normalized_name: string
          space_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          definition?: string | null
          first_source_id?: string | null
          id?: string
          importance?: number
          mastery?: number
          mastery_updated_at?: string | null
          name: string
          normalized_name: string
          space_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          definition?: string | null
          first_source_id?: string | null
          id?: string
          importance?: number
          mastery?: number
          mastery_updated_at?: string | null
          name?: string
          normalized_name?: string
          space_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepts_first_source_id_fkey"
            columns: ["first_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_chunks: {
        Row: {
          created_at: string
          embedding: string | null
          embedding_model: string
          id: string
          kind: string
          ref_id: string | null
          source_id: string | null
          space_id: string
          text: string
          token_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          embedding_model?: string
          id?: string
          kind: string
          ref_id?: string | null
          source_id?: string | null
          space_id: string
          text: string
          token_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          embedding_model?: string
          id?: string
          kind?: string
          ref_id?: string | null
          source_id?: string | null
          space_id?: string
          text?: string
          token_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_chunks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          created_at: string
          id: string
          source_id: string | null
          space_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_id?: string | null
          space_id: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source_id?: string | null
          space_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      derivations: {
        Row: {
          created_at: string
          derived_id: string
          derived_type: string
          id: string
          origin_hash: string
          origin_id: string
          origin_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          derived_id: string
          derived_type: string
          id?: string
          origin_hash: string
          origin_id: string
          origin_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          derived_id?: string
          derived_type?: string
          id?: string
          origin_hash?: string
          origin_id?: string
          origin_type?: string
          user_id?: string
        }
        Relationships: []
      }
      document_pages: {
        Row: {
          created_at: string
          figures: Json
          headings: Json
          id: string
          page_number: number
          source_id: string
          tables: Json
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          figures?: Json
          headings?: Json
          id?: string
          page_number: number
          source_id: string
          tables?: Json
          text?: string
          user_id: string
        }
        Update: {
          created_at?: string
          figures?: Json
          headings?: Json
          id?: string
          page_number?: number
          source_id?: string
          tables?: Json
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_topics: {
        Row: {
          concept_id: string | null
          created_at: string
          exam_id: string
          id: string
          priority: number
          title: string
          user_id: string
        }
        Insert: {
          concept_id?: string | null
          created_at?: string
          exam_id: string
          id?: string
          priority?: number
          title: string
          user_id: string
        }
        Update: {
          concept_id?: string | null
          created_at?: string
          exam_id?: string
          id?: string
          priority?: number
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_topics_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_topics_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string
          exam_date: string
          id: string
          notes: string | null
          plan_generated_at: string | null
          readiness: number
          readiness_updated_at: string | null
          space_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exam_date: string
          id?: string
          notes?: string | null
          plan_generated_at?: string | null
          readiness?: number
          readiness_updated_at?: string | null
          space_id: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exam_date?: string
          id?: string
          notes?: string | null
          plan_generated_at?: string | null
          readiness?: number
          readiness_updated_at?: string | null
          space_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_reports: {
        Row: {
          context: Json
          created_at: string
          id: string
          kind: string
          message: string
          status: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          kind: string
          message: string
          status?: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          kind?: string
          message?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      flashcards: {
        Row: {
          back: string
          concept_id: string | null
          created_at: string
          deck_id: string
          explanation: string | null
          front: string
          generation: number
          id: string
          is_user_edited: boolean
          source_ref: Json
          space_id: string
          suspended: boolean
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          back: string
          concept_id?: string | null
          created_at?: string
          deck_id: string
          explanation?: string | null
          front: string
          generation?: number
          id?: string
          is_user_edited?: boolean
          source_ref?: Json
          space_id: string
          suspended?: boolean
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          back?: string
          concept_id?: string | null
          created_at?: string
          deck_id?: string
          explanation?: string | null
          front?: string
          generation?: number
          id?: string
          is_user_edited?: boolean
          source_ref?: Json
          space_id?: string
          suspended?: boolean
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          attempt: number
          error_code: string | null
          error_detail: string | null
          finished_at: string | null
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          provider: string | null
          source_id: string
          stage: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          attempt?: number
          error_code?: string | null
          error_detail?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          provider?: string | null
          source_id: string
          stage: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          attempt?: number
          error_code?: string | null
          error_detail?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          provider?: string | null
          source_id?: string
          stage?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      note_blocks: {
        Row: {
          content: string
          content_hash: string
          created_at: string
          id: string
          is_user_edited: boolean
          level: number | null
          meta: Json
          note_id: string
          origin: string
          position: number
          source_ref: Json
          term: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          content_hash?: string
          created_at?: string
          id?: string
          is_user_edited?: boolean
          level?: number | null
          meta?: Json
          note_id: string
          origin?: string
          position: number
          source_ref?: Json
          term?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          content_hash?: string
          created_at?: string
          id?: string
          is_user_edited?: boolean
          level?: number | null
          meta?: Json
          note_id?: string
          origin?: string
          position?: number
          source_ref?: Json
          term?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_blocks_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          created_at: string
          generation: number
          id: string
          is_user_edited: boolean
          kind: string
          language: string | null
          source_id: string | null
          space_id: string
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          generation?: number
          id?: string
          is_user_edited?: boolean
          kind?: string
          language?: string | null
          source_id?: string | null
          space_id: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          generation?: number
          id?: string
          is_user_edited?: boolean
          kind?: string
          language?: string | null
          source_id?: string | null
          space_id?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          content_language: string | null
          created_at: string
          display_name: string | null
          education_level: string | null
          id: string
          onboarding_completed_at: string | null
          study_style: string | null
          timezone: string
          ui_locale: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          content_language?: string | null
          created_at?: string
          display_name?: string | null
          education_level?: string | null
          id: string
          onboarding_completed_at?: string | null
          study_style?: string | null
          timezone?: string
          ui_locale?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          content_language?: string | null
          created_at?: string
          display_name?: string | null
          education_level?: string | null
          id?: string
          onboarding_completed_at?: string | null
          study_style?: string | null
          timezone?: string
          ui_locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          completed_at: string | null
          correct: number
          id: string
          quiz_set_id: string
          score: number | null
          session_id: string | null
          started_at: string
          total: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          correct?: number
          id?: string
          quiz_set_id: string
          score?: number | null
          session_id?: string | null
          started_at?: string
          total?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          correct?: number
          id?: string
          quiz_set_id?: string
          score?: number | null
          session_id?: string | null
          started_at?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_set_id_fkey"
            columns: ["quiz_set_id"]
            isOneToOne: false
            referencedRelation: "quiz_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          answer: Json
          concept_id: string | null
          created_at: string
          explanation: string | null
          id: string
          idx: number
          options: Json
          prompt: string
          quiz_set_id: string
          source_ref: Json
          space_id: string
          tier: string
          type: string
          user_id: string
        }
        Insert: {
          answer: Json
          concept_id?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          idx: number
          options?: Json
          prompt: string
          quiz_set_id: string
          source_ref?: Json
          space_id: string
          tier?: string
          type: string
          user_id: string
        }
        Update: {
          answer?: Json
          concept_id?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          idx?: number
          options?: Json
          prompt?: string
          quiz_set_id?: string
          source_ref?: Json
          space_id?: string
          tier?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_quiz_set_id_fkey"
            columns: ["quiz_set_id"]
            isOneToOne: false
            referencedRelation: "quiz_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_responses: {
        Row: {
          answered_at: string
          attempt_id: string
          concept_id: string | null
          duration_ms: number | null
          grader_note: string | null
          id: string
          is_correct: boolean
          question_id: string
          response: Json | null
          user_id: string
        }
        Insert: {
          answered_at?: string
          attempt_id: string
          concept_id?: string | null
          duration_ms?: number | null
          grader_note?: string | null
          id?: string
          is_correct?: boolean
          question_id: string
          response?: Json | null
          user_id: string
        }
        Update: {
          answered_at?: string
          attempt_id?: string
          concept_id?: string | null
          duration_ms?: number | null
          grader_note?: string | null
          id?: string
          is_correct?: boolean
          question_id?: string
          response?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_responses_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_responses_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_sets: {
        Row: {
          config: Json
          created_at: string
          exam_id: string | null
          id: string
          mode: string
          question_count: number
          source_id: string | null
          space_id: string
          title: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          exam_id?: string | null
          id?: string
          mode?: string
          question_count?: number
          source_id?: string | null
          space_id: string
          title?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          exam_id?: string | null
          id?: string
          mode?: string
          question_count?: number
          source_id?: string | null
          space_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sets_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sets_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      review_events: {
        Row: {
          card_id: string
          concept_id: string | null
          difficulty_before: number | null
          duration_ms: number | null
          elapsed_days: number | null
          id: string
          rating: number
          reviewed_at: string
          scheduled_days: number | null
          session_id: string | null
          stability_before: number | null
          state_before: string | null
          user_id: string
        }
        Insert: {
          card_id: string
          concept_id?: string | null
          difficulty_before?: number | null
          duration_ms?: number | null
          elapsed_days?: number | null
          id?: string
          rating: number
          reviewed_at?: string
          scheduled_days?: number | null
          session_id?: string | null
          stability_before?: number | null
          state_before?: string | null
          user_id: string
        }
        Update: {
          card_id?: string
          concept_id?: string | null
          difficulty_before?: number | null
          duration_ms?: number | null
          elapsed_days?: number | null
          id?: string
          rating?: number
          reviewed_at?: string
          scheduled_days?: number | null
          session_id?: string | null
          stability_before?: number | null
          state_before?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_events_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "flashcards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_events_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          resource_id: string
          resource_type: string
          revoked_at: string | null
          token: string
          user_id: string
          view_count: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          resource_id: string
          resource_type: string
          revoked_at?: string | null
          token: string
          user_id: string
          view_count?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          resource_id?: string
          resource_type?: string
          revoked_at?: string | null
          token?: string
          user_id?: string
          view_count?: number
        }
        Relationships: []
      }
      sources: {
        Row: {
          attempts: number
          byte_size: number | null
          captured_at: string | null
          checksum: string | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          external_url: string | null
          id: string
          inline_text: string | null
          kind: string
          language: string | null
          mime_type: string | null
          page_count: number | null
          processed_at: string | null
          progress: number
          space_id: string
          stage: string | null
          status: string
          storage_path: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          byte_size?: number | null
          captured_at?: string | null
          checksum?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          external_url?: string | null
          id?: string
          inline_text?: string | null
          kind: string
          language?: string | null
          mime_type?: string | null
          page_count?: number | null
          processed_at?: string | null
          progress?: number
          space_id: string
          stage?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          byte_size?: number | null
          captured_at?: string | null
          checksum?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          external_url?: string | null
          id?: string
          inline_text?: string | null
          kind?: string
          language?: string | null
          mime_type?: string | null
          page_count?: number | null
          processed_at?: string | null
          progress?: number
          space_id?: string
          stage?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          error: string | null
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          type: string
        }
        Insert: {
          error?: string | null
          id: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          type: string
        }
        Update: {
          error?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      study_plan_items: {
        Row: {
          completed_at: string | null
          created_at: string
          estimated_minutes: number
          exam_id: string
          id: string
          kind: string
          priority: number
          scheduled_for: string
          skipped_at: string | null
          target: Json
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          estimated_minutes?: number
          exam_id: string
          id?: string
          kind: string
          priority?: number
          scheduled_for: string
          skipped_at?: string | null
          target?: Json
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          estimated_minutes?: number
          exam_id?: string
          id?: string
          kind?: string
          priority?: number
          scheduled_for?: string
          skipped_at?: string | null
          target?: Json
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_plan_items_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          ambience: string
          break_seconds: number
          cards_reviewed: number
          completed: boolean
          ended_at: string | null
          exam_id: string | null
          focused_seconds: number
          goal: string | null
          id: string
          mode: string
          planned_minutes: number
          questions_answered: number
          space_id: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          ambience?: string
          break_seconds?: number
          cards_reviewed?: number
          completed?: boolean
          ended_at?: string | null
          exam_id?: string | null
          focused_seconds?: number
          goal?: string | null
          id?: string
          mode?: string
          planned_minutes?: number
          questions_answered?: number
          space_id?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          ambience?: string
          break_seconds?: number
          cards_reviewed?: number
          completed?: boolean
          ended_at?: string | null
          exam_id?: string | null
          focused_seconds?: number
          goal?: string | null
          id?: string
          mode?: string
          planned_minutes?: number
          questions_answered?: number
          space_id?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      study_spaces: {
        Row: {
          accent: string
          archived_at: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          last_opened_at: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accent?: string
          archived_at?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          last_opened_at?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accent?: string
          archived_at?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          last_opened_at?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          plan: string
          price_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          plan?: string
          price_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          plan?: string
          price_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transcript_segments: {
        Row: {
          edited_at: string | null
          end_ms: number
          id: string
          idx: number
          original_text: string | null
          speaker: string | null
          start_ms: number
          text: string
          transcript_id: string
          user_id: string
        }
        Insert: {
          edited_at?: string | null
          end_ms?: number
          id?: string
          idx: number
          original_text?: string | null
          speaker?: string | null
          start_ms?: number
          text: string
          transcript_id: string
          user_id: string
        }
        Update: {
          edited_at?: string | null
          end_ms?: number
          id?: string
          idx?: number
          original_text?: string | null
          speaker?: string | null
          start_ms?: number
          text?: string
          transcript_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          created_at: string
          full_text: string
          id: string
          language: string | null
          model: string | null
          provider: string | null
          source_id: string
          updated_at: string
          user_id: string
          word_count: number
        }
        Insert: {
          created_at?: string
          full_text?: string
          id?: string
          language?: string | null
          model?: string | null
          provider?: string | null
          source_id: string
          updated_at?: string
          user_id: string
          word_count?: number
        }
        Update: {
          created_at?: string
          full_text?: string
          id?: string
          language?: string | null
          model?: string | null
          provider?: string | null
          source_id?: string
          updated_at?: string
          user_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          minutes_captured: number
          period_start: string
          quizzes_generated: number
          sources_processed: number
          tutor_messages: number
          updated_at: string
          user_id: string
        }
        Insert: {
          minutes_captured?: number
          period_start: string
          quizzes_generated?: number
          sources_processed?: number
          tutor_messages?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          minutes_captured?: number
          period_start?: string
          quizzes_generated?: number
          sources_processed?: number
          tutor_messages?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          analytics_opt_out: boolean
          created_at: string
          daily_review_hour: number | null
          default_ambience: string
          default_session_minutes: number
          font_scale: number
          haptics_enabled: boolean
          notify_exam_countdown: boolean
          notify_processing_done: boolean
          notify_review_due: boolean
          reduce_motion: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analytics_opt_out?: boolean
          created_at?: string
          daily_review_hour?: number | null
          default_ambience?: string
          default_session_minutes?: number
          font_scale?: number
          haptics_enabled?: boolean
          notify_exam_countdown?: boolean
          notify_processing_done?: boolean
          notify_review_due?: boolean
          reduce_motion?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analytics_opt_out?: boolean
          created_at?: string
          daily_review_hour?: number | null
          default_ambience?: string
          default_session_minutes?: number
          font_scale?: number
          haptics_enabled?: boolean
          notify_exam_countdown?: boolean
          notify_processing_done?: boolean
          notify_review_due?: boolean
          reduce_motion?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      stale_derivations: {
        Row: {
          derived_id: string | null
          derived_type: string | null
          origin_id: string | null
          origin_type: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      delete_my_account: { Args: never; Returns: undefined }
      due_cards: {
        Args: { p_limit?: number; p_space_id?: string }
        Returns: {
          back: string
          card_id: string
          concept_id: string
          deck_id: string
          difficulty: number
          due: string
          explanation: string
          front: string
          lapses: number
          last_review: string
          reps: number
          source_ref: Json
          space_id: string
          stability: number
          state: string
          tier: string
        }[]
      }
      due_counts: {
        Args: never
        Returns: {
          due_count: number
          space_id: string
          space_name: string
        }[]
      }
      get_shared_note: { Args: { p_token: string }; Returns: Json }
      increment_usage: {
        Args: { p_amount?: number; p_field: string }
        Returns: undefined
      }
      recompute_concept_mastery: {
        Args: { p_concept_id: string }
        Returns: number
      }
      search_content: {
        Args: {
          p_embedding?: string
          p_limit?: number
          p_query: string
          p_space_id?: string
        }
        Returns: {
          chunk_id: string
          kind: string
          ref_id: string
          score: number
          snippet: string
          source_id: string
          space_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
