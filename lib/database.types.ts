
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "applications": {
                  Row: {
                    "ai_safety_knowledge": string | null,"city": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"display_name": string,"email": string,"heard_other": string | null,"heard_via": Database["public"]['Enums']["heard_source"],"id": string,"motivation": string | null,"notice_version": string,"privacy_accepted_at": string,"real_name": string,"special_category_consent_at": string,"status": Database["public"]['Enums']["application_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_safety_knowledge"?: string | null,"city": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"display_name": string,"email": string,"heard_other"?: string | null,"heard_via": Database["public"]['Enums']["heard_source"],"id"?: string,"motivation"?: string | null,"notice_version": string,"privacy_accepted_at": string,"real_name": string,"special_category_consent_at": string,"status"?: Database["public"]['Enums']["application_status"],"updated_at"?: string
                  }
                  Update: {
                    "ai_safety_knowledge"?: string | null,"city"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"display_name"?: string,"email"?: string,"heard_other"?: string | null,"heard_via"?: Database["public"]['Enums']["heard_source"],"id"?: string,"motivation"?: string | null,"notice_version"?: string,"privacy_accepted_at"?: string,"real_name"?: string,"special_category_consent_at"?: string,"status"?: Database["public"]['Enums']["application_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"entity_id": string | null,"entity_type": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type": string,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"config": {
                  Row: {
                    "description": string,"key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description": string,"key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string,"key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"onboarding_steps": {
                  Row: {
                    "active": boolean,"confirmed_by": Database["public"]['Enums']["onboarding_confirmer"],"id": string,"key": string,"position": number,"title_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"confirmed_by": Database["public"]['Enums']["onboarding_confirmer"],"id"?: string,"key": string,"position": number,"title_key": string
                  }
                  Update: {
                    "active"?: boolean,"confirmed_by"?: Database["public"]['Enums']["onboarding_confirmer"],"id"?: string,"key"?: string,"position"?: number,"title_key"?: string
                  }
                  Relationships: [

                  ]
                },"profile_visibility": {
                  Row: {
                    "field": string,"tier": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "field": string,"tier": string,"user_id": string
                  }
                  Update: {
                    "field"?: string,"tier"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_visibility_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_visibility_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_onboarding": {
                  Row: {
                    "completed_at": string,"completed_by": string | null,"step_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string,"completed_by"?: string | null,"step_id": string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string,"completed_by"?: string | null,"step_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_onboarding_completed_by_fkey"
      columns: ["completed_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_onboarding_completed_by_fkey"
      columns: ["completed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_onboarding_step_id_fkey"
      columns: ["step_id"]
isOneToOne: false
      referencedRelation: "onboarding_steps"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_onboarding_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_onboarding_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "ai_risks": string | null,"ai_safety_knowledge": string | null,"bio": string | null,"city": string | null,"created_at": string,"display_name": string,"email": string,"first_active_at": string | null,"id": string,"is_admin": boolean,"joined_at": string,"last_login_at": string | null,"level": Database["public"]['Enums']["user_level"],"linkedin_url": string | null,"locale": string,"real_name": string,"status": Database["public"]['Enums']["user_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_risks"?: string | null,"ai_safety_knowledge"?: string | null,"bio"?: string | null,"city"?: string | null,"created_at"?: string,"display_name": string,"email": string,"first_active_at"?: string | null,"id": string,"is_admin"?: boolean,"joined_at"?: string,"last_login_at"?: string | null,"level"?: Database["public"]['Enums']["user_level"],"linkedin_url"?: string | null,"locale"?: string,"real_name": string,"status"?: Database["public"]['Enums']["user_status"],"updated_at"?: string
                  }
                  Update: {
                    "ai_risks"?: string | null,"ai_safety_knowledge"?: string | null,"bio"?: string | null,"city"?: string | null,"created_at"?: string,"display_name"?: string,"email"?: string,"first_active_at"?: string | null,"id"?: string,"is_admin"?: boolean,"joined_at"?: string,"last_login_at"?: string | null,"level"?: Database["public"]['Enums']["user_level"],"linkedin_url"?: string | null,"locale"?: string,"real_name"?: string,"status"?: Database["public"]['Enums']["user_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "members": {
                  Row: {
                    "display_name": string,"id": string,"level": Database["public"]['Enums']["user_level"]
                  }
                  ComputedFields: never
                  Insert: {
                           "display_name"?: string | null,"id"?: string | null,"level"?: Database["public"]['Enums']["user_level"] | null
                         }
                        Update: {
                           "display_name"?: string | null,"id"?: string | null,"level"?: Database["public"]['Enums']["user_level"] | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "can_view_profile_field":
{ Args: { "field": string,"owner": string,"viewer": string }; Returns: boolean
                           },
"get_profile":
{ Args: { "owner": string }; Returns: {
              "ai_risks": string,"ai_safety_knowledge": string,"bio": string,"city": string,"display_name": string,"email": string,"first_active_at": string,"id": string,"joined_at": string,"last_login_at": string,"level": Database["public"]['Enums']["user_level"],"linkedin_url": string,"real_name": string
            }[]
                           },
"is_active_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"profile_field_default_tier":
{ Args: { "field": string }; Returns: string
                           },
"shares_working_group":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"update_own_profile":
{ Args: { "ai_risks": string,"ai_safety_knowledge": string,"bio": string,"city": string,"display_name": string,"linkedin_url": string }; Returns: undefined
                           }
          }
          Enums: {
            "application_status": "pending"|"approved"|"rejected","heard_source": "global_website"|"italian_website"|"word_of_mouth"|"other","onboarding_confirmer": "self"|"auto"|"admin","user_level": "new"|"fresh"|"experienced","user_status": "active"|"deactivated"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "application_status": ["pending", "approved", "rejected"],"heard_source": ["global_website", "italian_website", "word_of_mouth", "other"],"onboarding_confirmer": ["self", "auto", "admin"],"user_level": ["new", "fresh", "experienced"],"user_status": ["active", "deactivated"]
          }
        }
} as const
