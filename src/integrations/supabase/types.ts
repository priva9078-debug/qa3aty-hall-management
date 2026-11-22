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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_items: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          notes: string | null
          product_name: string
          purchase_unit_price: number
          quantity_consumed: number
          quantity_purchased: number
          quantity_wasted: number
          responsibility: string
          tenant_id: string
          updated_at: string
          waste_cost: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          notes?: string | null
          product_name: string
          purchase_unit_price?: number
          quantity_consumed?: number
          quantity_purchased?: number
          quantity_wasted?: number
          responsibility?: string
          tenant_id: string
          updated_at?: string
          waste_cost?: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_name?: string
          purchase_unit_price?: number
          quantity_consumed?: number
          quantity_purchased?: number
          quantity_wasted?: number
          responsibility?: string
          tenant_id?: string
          updated_at?: string
          waste_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_tenant_id_booking_id_fkey"
            columns: ["tenant_id", "booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "booking_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_tenant_id_booking_id_fkey"
            columns: ["tenant_id", "booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "booking_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          advance_payment: number
          created_at: string
          created_by: string | null
          customer_id: string
          drinks_cake_responsibility: string
          end_time: string
          event_date: string
          event_name: string
          event_type: string
          hall_id: string
          id: string
          notes: string | null
          remaining_balance: number
          start_time: string
          status: string
          tenant_id: string
          total_paid: number
          total_price: number
          updated_at: string
        }
        Insert: {
          advance_payment?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          drinks_cake_responsibility?: string
          end_time: string
          event_date: string
          event_name: string
          event_type: string
          hall_id: string
          id?: string
          notes?: string | null
          remaining_balance?: number
          start_time: string
          status?: string
          tenant_id: string
          total_paid?: number
          total_price: number
          updated_at?: string
        }
        Update: {
          advance_payment?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          drinks_cake_responsibility?: string
          end_time?: string
          event_date?: string
          event_name?: string
          event_type?: string
          hall_id?: string
          id?: string
          notes?: string | null
          remaining_balance?: number
          start_time?: string
          status?: string
          tenant_id?: string
          total_paid?: number
          total_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_tenant_id_customer_id_fkey"
            columns: ["tenant_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tenant_id_hall_id_fkey"
            columns: ["tenant_id", "hall_id"]
            isOneToOne: false
            referencedRelation: "halls"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          full_name: string
          id: string
          notes: string | null
          phone: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          full_name: string
          id?: string
          notes?: string | null
          phone: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          device_label: string | null
          id: string
          last_seen_at: string
          provider: string
          tenant_id: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_seen_at?: string
          provider?: string
          tenant_id: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_seen_at?: string
          provider?: string
          tenant_id?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          booking_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          expense_date: string
          hall_id: string | null
          id: string
          notes: string | null
          receipt_path: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          expense_date?: string
          hall_id?: string | null
          id?: string
          notes?: string | null
          receipt_path?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          expense_date?: string
          hall_id?: string | null
          id?: string
          notes?: string | null
          receipt_path?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_booking_id_fkey"
            columns: ["tenant_id", "booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_hall_id_fkey"
            columns: ["tenant_id", "hall_id"]
            isOneToOne: false
            referencedRelation: "halls"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      halls: {
        Row: {
          address: string | null
          capacity: number | null
          contact_phone: string | null
          created_at: string
          default_booking_price: number
          description: string | null
          id: string
          image_path: string | null
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          contact_phone?: string | null
          created_at?: string
          default_booking_price?: number
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          capacity?: number | null
          contact_phone?: string | null
          created_at?: string
          default_booking_price?: number
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "halls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          quantity_on_hand: number
          tenant_id: string
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          quantity_on_hand?: number
          tenant_id: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          quantity_on_hand?: number
          tenant_id?: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          booking_id: string | null
          created_at: string
          created_by: string | null
          id: string
          inventory_item_id: string
          movement_date: string
          movement_type: string
          notes: string | null
          quantity_delta: number
          tenant_id: string
          unit_cost: number
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id: string
          movement_date?: string
          movement_type: string
          notes?: string | null
          quantity_delta: number
          tenant_id: string
          unit_cost?: number
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id?: string
          movement_date?: string
          movement_type?: string
          notes?: string | null
          quantity_delta?: number
          tenant_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_tenant_id_booking_id_fkey"
            columns: ["tenant_id", "booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_inventory_item_id_fkey"
            columns: ["tenant_id", "inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          booking_id: string | null
          channel: string
          created_at: string
          error_message: string | null
          id: string
          notification_id: string | null
          outcome: string
          provider_message_id: string | null
          tenant_id: string
        }
        Insert: {
          booking_id?: string | null
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id?: string | null
          outcome: string
          provider_message_id?: string | null
          tenant_id: string
        }
        Update: {
          booking_id?: string | null
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id?: string | null
          outcome?: string
          provider_message_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_tenant_id_booking_id_fkey"
            columns: ["tenant_id", "booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "notification_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          notification_type: string
          payload: Json
          read_at: string | null
          reminder_days_before: number | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          notification_type?: string
          payload?: Json
          read_at?: string | null
          reminder_days_before?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string
          payload?: Json
          read_at?: string | null
          reminder_days_before?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_booking_id_fkey"
            columns: ["tenant_id", "booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          is_active: boolean
          phone: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name: string
          is_active?: boolean
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string
          is_active?: boolean
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json
          id: string
          new_ends_at: string | null
          previous_ends_at: string | null
          subscription_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          new_ends_at?: string | null
          previous_ends_at?: string | null
          subscription_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          new_ends_at?: string | null
          previous_ends_at?: string | null
          subscription_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          notes: string | null
          plan: string
          price: number
          starts_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          plan: string
          price?: number
          starts_at: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          plan?: string
          price?: number
          starts_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          reminder_days: number[]
          settings: Json
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          id?: string
          reminder_days?: number[]
          settings?: Json
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          reminder_days?: number[]
          settings?: Json
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          primary_hall_name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          primary_hall_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          primary_hall_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_type: string
          period_end: string | null
          period_start: string | null
          tenant_id: string
          worker_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_type: string
          period_end?: string | null
          period_start?: string | null
          tenant_id: string
          worker_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_type?: string
          period_end?: string | null
          period_start?: string | null
          tenant_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payments_tenant_id_worker_id_fkey"
            columns: ["tenant_id", "worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      workers: {
        Row: {
          created_at: string
          daily_wage: number | null
          fixed_salary: number | null
          full_name: string
          id: string
          job_title: string | null
          joining_date: string
          phone: string | null
          salary_type: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_wage?: number | null
          fixed_salary?: number | null
          full_name: string
          id?: string
          job_title?: string | null
          joining_date?: string
          phone?: string | null
          salary_type: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_wage?: number | null
          fixed_salary?: number | null
          full_name?: string
          id?: string
          job_title?: string | null
          joining_date?: string
          phone?: string | null
          salary_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_super_admin: {
        Args: { _full_name: string; _user_id: string; _username: string }
        Returns: string
      }
      create_tenant_bundle: {
        Args: {
          _actor_user_id: string
          _admin_user_id: string
          _ends_at: string
          _full_name: string
          _notes: string
          _phone: string
          _plan: string
          _primary_hall_name: string
          _starts_at: string
          _subscription_price: number
          _tenant_name: string
          _tenant_status: string
          _username: string
        }
        Returns: string
      }
      current_tenant_id: { Args: never; Returns: string }
      financial_report: {
        Args: {
          _end_date: string
          _hall_id?: string
          _start_date: string
          _tenant_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      tenant_accessible: { Args: { _tenant_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "tenant_admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "tenant_admin"],
    },
  },
} as const
