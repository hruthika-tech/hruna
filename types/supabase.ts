export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          reason: string | null
          subject_id: string | null
          subject_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          reason?: string | null
          subject_id?: string | null
          subject_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          subject_id?: string | null
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          audience: Database["public"]["Enums"]["notification_audience"]
          created_at: string
          created_by: string
          id: string
          message: string
          title: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["notification_audience"]
          created_at?: string
          created_by: string
          id?: string
          message: string
          title: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["notification_audience"]
          created_at?: string
          created_by?: string
          id?: string
          message?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          category: string | null
          cover_image_file_id: string | null
          created_at: string
          description: string | null
          designer_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          cover_image_file_id?: string | null
          created_at?: string
          description?: string | null
          designer_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          cover_image_file_id?: string | null
          created_at?: string
          description?: string | null
          designer_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_cover_image_file_id_fkey"
            columns: ["cover_image_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          customer_id: string
          customer_last_read_at: string | null
          designer_id: string
          designer_last_read_at: string | null
          id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          customer_last_read_at?: string | null
          designer_id: string
          designer_last_read_at?: string | null
          id?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          customer_last_read_at?: string | null
          designer_id?: string
          designer_last_read_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          avatar_file_id: string | null
          city: string | null
          created_at: string
          id: string
          name: string
          notification_preferences: Json
          phone: string | null
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_file_id?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name: string
          notification_preferences?: Json
          phone?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_file_id?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          notification_preferences?: Json
          phone?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_avatar_file_id_fkey"
            columns: ["avatar_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_saved_items: {
        Row: {
          collection_id: string | null
          created_at: string
          customer_id: string
          designer_id: string | null
          dress_id: string | null
          id: string
          item_type: Database["public"]["Enums"]["saved_item_type"]
          project_id: string | null
        }
        Insert: {
          collection_id?: string | null
          created_at?: string
          customer_id: string
          designer_id?: string | null
          dress_id?: string | null
          id?: string
          item_type: Database["public"]["Enums"]["saved_item_type"]
          project_id?: string | null
        }
        Update: {
          collection_id?: string | null
          created_at?: string
          customer_id?: string
          designer_id?: string | null
          dress_id?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["saved_item_type"]
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_saved_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_saved_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_saved_items_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_saved_items_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_saved_items_dress_id_fkey"
            columns: ["dress_id"]
            isOneToOne: false
            referencedRelation: "dresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_saved_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_credentials: {
        Row: {
          created_at: string
          designer_id: string
          id: string
          institution: string | null
          qualification: string | null
          type: string
          year: string | null
        }
        Insert: {
          created_at?: string
          designer_id: string
          id?: string
          institution?: string | null
          qualification?: string | null
          type: string
          year?: string | null
        }
        Update: {
          created_at?: string
          designer_id?: string
          id?: string
          institution?: string | null
          qualification?: string | null
          type?: string
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "designer_credentials_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_credentials_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_onboarding: {
        Row: {
          about_studio: string | null
          address: string | null
          area: string | null
          city: string | null
          date_of_birth: string | null
          designer_id: string
          email_verified: boolean
          experience_description: string | null
          experience_level: string | null
          instagram_url: string | null
          learning_background: string | null
          other_role_description: string | null
          phone: string | null
          phone_verified: boolean
          portfolio_ownership_accepted: boolean
          roles: string[]
          service_locations: string[]
          specialization_categories: string[]
          specialization_crafts: string[]
          studio_name: string | null
          updated_at: string
          website_url: string | null
          working_model: string | null
        }
        Insert: {
          about_studio?: string | null
          address?: string | null
          area?: string | null
          city?: string | null
          date_of_birth?: string | null
          designer_id: string
          email_verified?: boolean
          experience_description?: string | null
          experience_level?: string | null
          instagram_url?: string | null
          learning_background?: string | null
          other_role_description?: string | null
          phone?: string | null
          phone_verified?: boolean
          portfolio_ownership_accepted?: boolean
          roles?: string[]
          service_locations?: string[]
          specialization_categories?: string[]
          specialization_crafts?: string[]
          studio_name?: string | null
          updated_at?: string
          website_url?: string | null
          working_model?: string | null
        }
        Update: {
          about_studio?: string | null
          address?: string | null
          area?: string | null
          city?: string | null
          date_of_birth?: string | null
          designer_id?: string
          email_verified?: boolean
          experience_description?: string | null
          experience_level?: string | null
          instagram_url?: string | null
          learning_background?: string | null
          other_role_description?: string | null
          phone?: string | null
          phone_verified?: boolean
          portfolio_ownership_accepted?: boolean
          roles?: string[]
          service_locations?: string[]
          specialization_categories?: string[]
          specialization_crafts?: string[]
          studio_name?: string | null
          updated_at?: string
          website_url?: string | null
          working_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "designer_onboarding_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: true
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_onboarding_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: true
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_portfolio_items: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          designer_id: string
          file_id: string | null
          id: string
          title: string
          year: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          designer_id: string
          file_id?: string | null
          id?: string
          title: string
          year?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          designer_id?: string
          file_id?: string | null
          id?: string
          title?: string
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "designer_portfolio_items_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_portfolio_items_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_portfolio_items_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_profiles: {
        Row: {
          atelier_location: string | null
          avatar_file_id: string | null
          banner_file_id: string | null
          bio: string | null
          city: string | null
          contact_email: string | null
          country: string | null
          created_at: string
          experience_years: number
          id: string
          instagram_url: string | null
          opening_hours: string | null
          rating: number
          review_count: number
          specializations: string[]
          starting_price: number | null
          story: string | null
          studio_name: string
          type: Database["public"]["Enums"]["designer_type"]
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          atelier_location?: string | null
          avatar_file_id?: string | null
          banner_file_id?: string | null
          bio?: string | null
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          experience_years?: number
          id?: string
          instagram_url?: string | null
          opening_hours?: string | null
          rating?: number
          review_count?: number
          specializations?: string[]
          starting_price?: number | null
          story?: string | null
          studio_name?: string
          type?: Database["public"]["Enums"]["designer_type"]
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          atelier_location?: string | null
          avatar_file_id?: string | null
          banner_file_id?: string | null
          bio?: string | null
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          experience_years?: number
          id?: string
          instagram_url?: string | null
          opening_hours?: string | null
          rating?: number
          review_count?: number
          specializations?: string[]
          starting_price?: number | null
          story?: string | null
          studio_name?: string
          type?: Database["public"]["Enums"]["designer_type"]
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "designer_profiles_avatar_file_id_fkey"
            columns: ["avatar_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_profiles_banner_file_id_fkey"
            columns: ["banner_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_request_interactions: {
        Row: {
          designer_id: string
          request_id: string
          saved: boolean
          swipe_status: string | null
          updated_at: string
        }
        Insert: {
          designer_id: string
          request_id: string
          saved?: boolean
          swipe_status?: string | null
          updated_at?: string
        }
        Update: {
          designer_id?: string
          request_id?: string
          saved?: boolean
          swipe_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "designer_request_interactions_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_request_interactions_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_request_interactions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "fashion_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_verifications: {
        Row: {
          designer_id: string
          identity_failure_reason: string | null
          identity_status: Database["public"]["Enums"]["identity_status"]
          overall_status: Database["public"]["Enums"]["designer_overall_status"]
          portfolio_review_note: string | null
          portfolio_status: Database["public"]["Enums"]["portfolio_status"]
          profile_review_note: string | null
          reviewed_at: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          designer_id: string
          identity_failure_reason?: string | null
          identity_status?: Database["public"]["Enums"]["identity_status"]
          overall_status?: Database["public"]["Enums"]["designer_overall_status"]
          portfolio_review_note?: string | null
          portfolio_status?: Database["public"]["Enums"]["portfolio_status"]
          profile_review_note?: string | null
          reviewed_at?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          designer_id?: string
          identity_failure_reason?: string | null
          identity_status?: Database["public"]["Enums"]["identity_status"]
          overall_status?: Database["public"]["Enums"]["designer_overall_status"]
          portfolio_review_note?: string | null
          portfolio_status?: Database["public"]["Enums"]["portfolio_status"]
          profile_review_note?: string | null
          reviewed_at?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "designer_verifications_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: true
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_verifications_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: true
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diary_entries: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          mood: string | null
          note: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          mood?: string | null
          note?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          mood?: string | null
          note?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diary_entry_images: {
        Row: {
          created_at: string
          entry_id: string
          file_id: string
          id: string
          position: number
        }
        Insert: {
          created_at?: string
          entry_id: string
          file_id: string
          id?: string
          position?: number
        }
        Update: {
          created_at?: string
          entry_id?: string
          file_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "diary_entry_images_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "diary_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diary_entry_images_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_notes: {
        Row: {
          admin_id: string
          created_at: string
          dispute_id: string
          id: string
          note: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          dispute_id: string
          id?: string
          note: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          dispute_id?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_notes_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_notes_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          created_at: string
          customer_id: string
          designer_id: string
          details: string | null
          id: string
          issue: string
          project_id: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          designer_id: string
          details?: string | null
          id?: string
          issue: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          designer_id?: string
          details?: string | null
          id?: string
          issue?: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dress_images: {
        Row: {
          created_at: string
          dress_id: string
          file_id: string
          id: string
          position: number
        }
        Insert: {
          created_at?: string
          dress_id: string
          file_id: string
          id?: string
          position?: number
        }
        Update: {
          created_at?: string
          dress_id?: string
          file_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "dress_images_dress_id_fkey"
            columns: ["dress_id"]
            isOneToOne: false
            referencedRelation: "dresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dress_images_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      dresses: {
        Row: {
          available: boolean
          collection_id: string
          created_at: string
          description: string | null
          designer_id: string
          fabric: string | null
          id: string
          name: string
          price: number
          stock_status: Database["public"]["Enums"]["dress_stock_status"]
          updated_at: string
        }
        Insert: {
          available?: boolean
          collection_id: string
          created_at?: string
          description?: string | null
          designer_id: string
          fabric?: string | null
          id?: string
          name: string
          price?: number
          stock_status?: Database["public"]["Enums"]["dress_stock_status"]
          updated_at?: string
        }
        Update: {
          available?: boolean
          collection_id?: string
          created_at?: string
          description?: string | null
          designer_id?: string
          fabric?: string | null
          id?: string
          name?: string
          price?: number
          stock_status?: Database["public"]["Enums"]["dress_stock_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dresses_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dresses_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dresses_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fashion_requests: {
        Row: {
          additional_preferences: string | null
          budget_max: number | null
          budget_min: number | null
          category: string
          created_at: string
          customer_id: string
          description: string
          due_date: string | null
          fabric_preference: string | null
          gender: string | null
          id: string
          location: string | null
          measurements: Json
          occasion: string | null
          preferred_designer_id: string | null
          size: string | null
          status: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at: string
          visibility: string | null
        }
        Insert: {
          additional_preferences?: string | null
          budget_max?: number | null
          budget_min?: number | null
          category: string
          created_at?: string
          customer_id: string
          description: string
          due_date?: string | null
          fabric_preference?: string | null
          gender?: string | null
          id?: string
          location?: string | null
          measurements?: Json
          occasion?: string | null
          preferred_designer_id?: string | null
          size?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at?: string
          visibility?: string | null
        }
        Update: {
          additional_preferences?: string | null
          budget_max?: number | null
          budget_min?: number | null
          category?: string
          created_at?: string
          customer_id?: string
          description?: string
          due_date?: string | null
          fabric_preference?: string | null
          gender?: string | null
          id?: string
          location?: string | null
          measurements?: Json
          occasion?: string | null
          preferred_designer_id?: string | null
          size?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
          updated_at?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fashion_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fashion_requests_preferred_designer_id_fkey"
            columns: ["preferred_designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fashion_requests_preferred_designer_id_fkey"
            columns: ["preferred_designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          bucket_id: string
          created_at: string
          entity_type: string
          id: string
          is_private: boolean
          mime_type: string | null
          owner_id: string
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          entity_type: string
          id?: string
          is_private?: boolean
          mime_type?: string | null
          owner_id: string
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          entity_type?: string
          id?: string
          is_private?: boolean
          mime_type?: string | null
          owner_id?: string
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meet_the_designer_entries: {
        Row: {
          created_at: string
          description: string | null
          designer_id: string
          file_id: string
          id: string
          position: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          designer_id: string
          file_id: string
          id?: string
          position?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          designer_id?: string
          file_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "meet_the_designer_entries_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meet_the_designer_entries_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meet_the_designer_entries_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          image_file_id: string | null
          sender_id: string
          text: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          image_file_id?: string | null
          sender_id: string
          text: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          image_file_id?: string | null
          sender_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation_previews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_image_file_id_fkey"
            columns: ["image_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_key: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_key: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_key?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          currency: string
          customer_subscriptions_enabled: boolean
          designer_subscriptions_enabled: boolean
          id: boolean
          payment_system_enabled: boolean
          updated_at: string
        }
        Insert: {
          currency?: string
          customer_subscriptions_enabled?: boolean
          designer_subscriptions_enabled?: boolean
          id?: boolean
          payment_system_enabled?: boolean
          updated_at?: string
        }
        Update: {
          currency?: string
          customer_subscriptions_enabled?: boolean
          designer_subscriptions_enabled?: boolean
          id?: boolean
          payment_system_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          payment_provider: string
          plan_id: string | null
          provider_order_id: string | null
          provider_reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          payment_provider?: string
          plan_id?: string | null
          provider_order_id?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          payment_provider?: string
          plan_id?: string | null
          provider_order_id?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      previous_creation_images: {
        Row: {
          created_at: string
          file_id: string
          id: string
          position: number
          previous_creation_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          position?: number
          previous_creation_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          position?: number
          previous_creation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "previous_creation_images_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previous_creation_images_previous_creation_id_fkey"
            columns: ["previous_creation_id"]
            isOneToOne: false
            referencedRelation: "previous_creations"
            referencedColumns: ["id"]
          },
        ]
      }
      previous_creations: {
        Row: {
          created_at: string
          description: string | null
          designer_id: string
          id: string
          updated_at: string
          year: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          designer_id: string
          id?: string
          updated_at?: string
          year?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          designer_id?: string
          id?: string
          updated_at?: string
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "previous_creations_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previous_creations_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_update_images: {
        Row: {
          created_at: string
          file_id: string
          id: string
          position: number
          update_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          position?: number
          update_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          position?: number
          update_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_update_images_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_update_images_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "project_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_updates: {
        Row: {
          author_id: string
          created_at: string
          id: string
          note: string | null
          project_id: string
          stage: Database["public"]["Enums"]["project_stage"]
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          note?: string | null
          project_id: string
          stage: Database["public"]["Enums"]["project_stage"]
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          note?: string | null
          project_id?: string
          stage?: Database["public"]["Enums"]["project_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "project_updates_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_updates_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          changes_requested_at: string | null
          completed_at: string | null
          created_at: string
          customer_id: string
          designer_id: string
          id: string
          progress_percent: number
          proposal_id: string
          request_id: string
          stage: Database["public"]["Enums"]["project_stage"]
          stages: Database["public"]["Enums"]["project_stage"][]
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          changes_requested_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id: string
          designer_id: string
          id?: string
          progress_percent?: number
          proposal_id: string
          request_id: string
          stage?: Database["public"]["Enums"]["project_stage"]
          stages?: Database["public"]["Enums"]["project_stage"][]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          changes_requested_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          designer_id?: string
          id?: string
          progress_percent?: number
          proposal_id?: string
          request_id?: string
          stage?: Database["public"]["Enums"]["project_stage"]
          stages?: Database["public"]["Enums"]["project_stage"][]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "fashion_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          created_at: string
          description: string | null
          designer_id: string
          estimated_days: number | null
          id: string
          notes: string | null
          price: number
          request_id: string
          status: Database["public"]["Enums"]["proposal_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          designer_id: string
          estimated_days?: number | null
          id?: string
          notes?: string | null
          price: number
          request_id: string
          status?: Database["public"]["Enums"]["proposal_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          designer_id?: string
          estimated_days?: number | null
          id?: string
          notes?: string | null
          price?: number
          request_id?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "fashion_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_images: {
        Row: {
          created_at: string
          file_id: string
          id: string
          position: number
          request_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          position?: number
          request_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          position?: number
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_images_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_images_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "fashion_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          created_at: string
          customer_id: string
          designer_id: string
          id: string
          project_id: string
          rating: number
          review_text: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          designer_id: string
          id?: string
          project_id: string
          rating: number
          review_text: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          designer_id?: string
          id?: string
          project_id?: string
          rating?: number
          review_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_highlights: {
        Row: {
          caption: string | null
          created_at: string
          designer_id: string
          file_id: string
          id: string
          position: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          designer_id: string
          file_id: string
          id?: string
          position?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          designer_id?: string
          file_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_highlights_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_highlights_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_highlights_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          billing_interval: string
          created_at: string
          currency: string
          description: string | null
          features: string[]
          id: string
          is_active: boolean
          name: string
          price: number
          role: Database["public"]["Enums"]["subscriber_role"]
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: string[]
          id?: string
          is_active?: boolean
          name: string
          price: number
          role: Database["public"]["Enums"]["subscriber_role"]
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: string[]
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          role?: Database["public"]["Enums"]["subscriber_role"]
          updated_at?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reports: {
        Row: {
          admin_decision: string | null
          conversation_id: string | null
          created_at: string
          description: string | null
          id: string
          message_ids: string[]
          reason: Database["public"]["Enums"]["user_report_reason"]
          reported_id: string
          reporter_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["user_report_status"]
          updated_at: string
        }
        Insert: {
          admin_decision?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          message_ids?: string[]
          reason: Database["public"]["Enums"]["user_report_reason"]
          reported_id: string
          reporter_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["user_report_status"]
          updated_at?: string
        }
        Update: {
          admin_decision?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          message_ids?: string[]
          reason?: Database["public"]["Enums"]["user_report_reason"]
          reported_id?: string
          reporter_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["user_report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation_previews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          end_date: string | null
          id: string
          payment_provider_subscription_id: string | null
          plan_id: string
          renewal_date: string | null
          role: Database["public"]["Enums"]["subscriber_role"]
          start_date: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          payment_provider_subscription_id?: string | null
          plan_id: string
          renewal_date?: string | null
          role: Database["public"]["Enums"]["subscriber_role"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          payment_provider_subscription_id?: string | null
          plan_id?: string
          renewal_date?: string | null
          role?: Database["public"]["Enums"]["subscriber_role"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_admin: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_admin?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      conversation_previews: {
        Row: {
          customer_id: string | null
          customer_last_read_at: string | null
          customer_unread_count: number | null
          designer_id: string | null
          designer_last_read_at: string | null
          designer_unread_count: number | null
          id: string | null
          last_message: string | null
          last_message_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_designer_id_fkey"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "designer_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      designer_public_profiles: {
        Row: {
          atelier_location: string | null
          avatar_file_id: string | null
          banner_file_id: string | null
          bio: string | null
          city: string | null
          contact_email: string | null
          country: string | null
          created_at: string | null
          experience_years: number | null
          id: string | null
          instagram_url: string | null
          is_approved: boolean | null
          opening_hours: string | null
          rating: number | null
          review_count: number | null
          specializations: string[] | null
          starting_price: number | null
          story: string | null
          studio_name: string | null
          type: Database["public"]["Enums"]["designer_type"] | null
          updated_at: string | null
          user_id: string | null
          website_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "designer_profiles_avatar_file_id_fkey"
            columns: ["avatar_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_profiles_banner_file_id_fkey"
            columns: ["banner_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_proposal: {
        Args: { p_proposal_id: string }
        Returns: {
          changes_requested_at: string | null
          completed_at: string | null
          created_at: string
          customer_id: string
          designer_id: string
          id: string
          progress_percent: number
          proposal_id: string
          request_id: string
          stage: Database["public"]["Enums"]["project_stage"]
          stages: Database["public"]["Enums"]["project_stage"][]
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_start_conversation: {
        Args: { p_customer_id: string; p_designer_id: string }
        Returns: boolean
      }
      conversation_block_state: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      conversation_other_user: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      current_customer_id: { Args: never; Returns: string }
      current_designer_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_approved_designer: { Args: never; Returns: boolean }
      mark_request_proposal_received: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      my_blocked_users: {
        Args: never
        Returns: {
          blocked_at: string
          blocked_id: string
          display_name: string
        }[]
      }
      start_identity_verification: { Args: never; Returns: undefined }
      submit_designer_profile_for_verification: {
        Args: never
        Returns: undefined
      }
      submit_portfolio_for_review: { Args: never; Returns: undefined }
      user_report_evidence_ok: {
        Args: {
          p_conversation_id: string
          p_message_ids: string[]
          p_reported_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_status: "active" | "suspended"
      designer_overall_status:
        | "not_submitted"
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
      designer_type: "Designer" | "Boutique" | "Tailor"
      dispute_status: "open" | "under_review" | "resolved" | "closed"
      dress_stock_status: "in_stock" | "made_to_order" | "unavailable"
      identity_status:
        | "not_started"
        | "pending"
        | "verified"
        | "failed"
        | "requires_action"
      notification_audience: "all" | "customer" | "designer"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
      portfolio_status:
        | "not_submitted"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "revision_required"
      project_stage:
        | "Request Accepted"
        | "Design Confirmed"
        | "Fabric Selected"
        | "Cutting"
        | "Stitching"
        | "Fitting"
        | "Final Alterations"
        | "Completed"
      project_status:
        | "active"
        | "on_hold"
        | "awaiting_confirmation"
        | "completed"
        | "cancelled"
      proposal_status: "pending" | "accepted" | "declined"
      request_status:
        | "draft"
        | "submitted"
        | "reviewed"
        | "proposal_received"
        | "accepted"
        | "declined"
        | "cancelled"
        | "expired"
      saved_item_type: "designer" | "dress" | "collection" | "project"
      subscriber_role: "customer" | "designer"
      subscription_status: "none" | "active" | "expired" | "cancelled"
      user_report_reason:
        | "harassment"
        | "scam"
        | "spam"
        | "inappropriate"
        | "impersonation"
        | "other"
      user_report_status: "pending" | "under_review" | "resolved" | "dismissed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["active", "suspended"],
      designer_overall_status: [
        "not_submitted",
        "pending",
        "approved",
        "rejected",
        "suspended",
      ],
      designer_type: ["Designer", "Boutique", "Tailor"],
      dispute_status: ["open", "under_review", "resolved", "closed"],
      dress_stock_status: ["in_stock", "made_to_order", "unavailable"],
      identity_status: [
        "not_started",
        "pending",
        "verified",
        "failed",
        "requires_action",
      ],
      notification_audience: ["all", "customer", "designer"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      portfolio_status: [
        "not_submitted",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "revision_required",
      ],
      project_stage: [
        "Request Accepted",
        "Design Confirmed",
        "Fabric Selected",
        "Cutting",
        "Stitching",
        "Fitting",
        "Final Alterations",
        "Completed",
      ],
      project_status: [
        "active",
        "on_hold",
        "awaiting_confirmation",
        "completed",
        "cancelled",
      ],
      proposal_status: ["pending", "accepted", "declined"],
      request_status: [
        "draft",
        "submitted",
        "reviewed",
        "proposal_received",
        "accepted",
        "declined",
        "cancelled",
        "expired",
      ],
      saved_item_type: ["designer", "dress", "collection", "project"],
      subscriber_role: ["customer", "designer"],
      subscription_status: ["none", "active", "expired", "cancelled"],
      user_report_reason: [
        "harassment",
        "scam",
        "spam",
        "inappropriate",
        "impersonation",
        "other",
      ],
      user_report_status: ["pending", "under_review", "resolved", "dismissed"],
    },
  },
} as const

