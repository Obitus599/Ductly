export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      teams: {
        Row: {
          id: string;
          name: string;
          whatsapp_number: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          whatsapp_number: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          whatsapp_number?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      customers: {
        Row: {
          id: string;
          name: string;
          phone: string;
          email: string;
          whatsapp_opt_in: boolean;
          last_booking: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          email: string;
          whatsapp_opt_in?: boolean;
          last_booking?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          email?: string;
          whatsapp_opt_in?: boolean;
          last_booking?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          team_id: string | null;
          customer_id: string;
          slot_start: string;
          slot_end: string;
          address: string;
          status: string;
          payment_intent_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id?: string | null;
          customer_id: string;
          slot_start: string;
          slot_end: string;
          address: string;
          status?: string;
          payment_intent_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string | null;
          customer_id?: string;
          slot_start?: string;
          slot_end?: string;
          address?: string;
          status?: string;
          payment_intent_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      booking_locks: {
        Row: {
          id: string;
          slot_start: string;
          session_id: string;
          locked_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          slot_start: string;
          session_id: string;
          locked_at?: string;
          expires_at: string;
        };
        Update: {
          id?: string;
          slot_start?: string;
          session_id?: string;
          locked_at?: string;
          expires_at?: string;
        };
      };
      slot_locks: {
        Row: {
          id: string;
          team_id: string;
          slot_start: string;
          booking_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          slot_start: string;
          booking_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          slot_start?: string;
          booking_id?: string;
          created_at?: string;
        };
      };
      team_schedules: {
        Row: {
          id: string;
          team_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      travel_cache: {
        Row: {
          origin_geohash: string;
          dest_geohash: string;
          time_bucket: string;
          duration_mins: number;
          fetched_at: string;
          expires_at: string;
        };
        Insert: {
          origin_geohash: string;
          dest_geohash: string;
          time_bucket: string;
          duration_mins: number;
          fetched_at?: string;
          expires_at: string;
        };
        Update: {
          origin_geohash?: string;
          dest_geohash?: string;
          time_bucket?: string;
          duration_mins?: number;
          fetched_at?: string;
          expires_at?: string;
        };
      };
      feedback: {
        Row: {
          id: string;
          booking_id: string;
          customer_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          customer_id: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          customer_id?: string;
          rating?: number;
          comment?: string | null;
          created_at?: string;
        };
      };
      error_log: {
        Row: {
          id: string;
          flow_name: string;
          error_message: string;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          flow_name: string;
          error_message: string;
          payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          flow_name?: string;
          error_message?: string;
          payload?: Json | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
};
