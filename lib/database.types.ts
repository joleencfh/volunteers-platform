
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activities": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"description": string | null,"details": NonNullable<Json>,"due_on": string | null,"group_id": string,"id": string,"is_general": boolean,"key_activity": boolean,"lead_id": string | null,"links": NonNullable<Json>,"postmortem_improvements": string | null,"postmortem_learnings": string | null,"postmortem_went_well": string | null,"starts_on": string | null,"status": Database["public"]['Enums']["activity_status"],"title": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"details"?: NonNullable<Json>,"due_on"?: string | null,"group_id": string,"id"?: string,"is_general"?: boolean,"key_activity"?: boolean,"lead_id"?: string | null,"links"?: NonNullable<Json>,"postmortem_improvements"?: string | null,"postmortem_learnings"?: string | null,"postmortem_went_well"?: string | null,"starts_on"?: string | null,"status"?: Database["public"]['Enums']["activity_status"],"title": string,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"details"?: NonNullable<Json>,"due_on"?: string | null,"group_id"?: string,"id"?: string,"is_general"?: boolean,"key_activity"?: boolean,"lead_id"?: string | null,"links"?: NonNullable<Json>,"postmortem_improvements"?: string | null,"postmortem_learnings"?: string | null,"postmortem_went_well"?: string | null,"starts_on"?: string | null,"status"?: Database["public"]['Enums']["activity_status"],"title"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activities_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "working_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activities_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activities_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"activity_participants": {
                  Row: {
                    "activity_id": string,"joined_at": string,"role": Database["public"]['Enums']["participant_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"joined_at"?: string,"role"?: Database["public"]['Enums']["participant_role"],"user_id": string
                  }
                  Update: {
                    "activity_id"?: string,"joined_at"?: string,"role"?: Database["public"]['Enums']["participant_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_participants_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_participants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_participants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"applications": {
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
                },"data_requests": {
                  Row: {
                    "created_at": string,"handled_at": string | null,"handled_by": string | null,"id": string,"kind": Database["public"]['Enums']["data_request_kind"],"status": Database["public"]['Enums']["data_request_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["data_request_kind"],"status"?: Database["public"]['Enums']["data_request_status"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["data_request_kind"],"status"?: Database["public"]['Enums']["data_request_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "data_requests_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "data_requests_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "data_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "data_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
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
                },"tasks": {
                  Row: {
                    "activity_id": string,"assignee_id": string | null,"completed_at": string | null,"completion_note": string | null,"completion_url": string | null,"created_at": string,"created_by": string | null,"description": string | null,"due_on": string | null,"group_id": string,"id": string,"status": Database["public"]['Enums']["task_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"assignee_id"?: string | null,"completed_at"?: string | null,"completion_note"?: string | null,"completion_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_on"?: string | null,"group_id": string,"id"?: string,"status"?: Database["public"]['Enums']["task_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "activity_id"?: string,"assignee_id"?: string | null,"completed_at"?: string | null,"completion_note"?: string | null,"completion_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_on"?: string | null,"group_id"?: string,"id"?: string,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "working_groups"
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
                },"wg_join_requests": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"group_id": string,"id": string,"status": Database["public"]['Enums']["join_request_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"group_id": string,"id"?: string,"status"?: Database["public"]['Enums']["join_request_status"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"group_id"?: string,"id"?: string,"status"?: Database["public"]['Enums']["join_request_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wg_join_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_join_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_join_requests_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "working_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_join_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_join_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"wg_leads": {
                  Row: {
                    "assigned_at": string,"assigned_by": string | null,"group_id": string,"id": string,"user_id": string,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"group_id": string,"id"?: string,"user_id": string,"week_start": string
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"group_id"?: string,"id"?: string,"user_id"?: string,"week_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wg_leads_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_leads_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_leads_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "working_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_leads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_leads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"wg_meetings": {
                  Row: {
                    "agenda_url": string | null,"created_at": string,"created_by": string | null,"group_id": string,"id": string,"meeting_url": string,"starts_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agenda_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"group_id": string,"id"?: string,"meeting_url": string,"starts_at": string,"updated_at"?: string
                  }
                  Update: {
                    "agenda_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"group_id"?: string,"id"?: string,"meeting_url"?: string,"starts_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wg_meetings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_meetings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_meetings_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "working_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"wg_members": {
                  Row: {
                    "added_by": string | null,"group_id": string,"joined_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"group_id": string,"joined_at"?: string,"user_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"group_id"?: string,"joined_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wg_members_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_members_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "working_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wg_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"working_groups": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"description": string,"docs_url": string | null,"id": string,"name": string,"signal_url": string | null,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"description": string,"docs_url"?: string | null,"id"?: string,"name": string,"signal_url"?: string | null,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"description"?: string,"docs_url"?: string | null,"id"?: string,"name"?: string,"signal_url"?: string | null,"slug"?: string,"updated_at"?: string
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
            "activity_group":
{ Args: { "p_activity": string }; Returns: string
                           },
"can_approve_join":
{ Args: { "p_group": string }; Returns: boolean
                           },
"can_archive_activity":
{ Args: { "p_activity": string }; Returns: boolean
                           },
"can_assign_lead":
{ Args: { "p_group": string }; Returns: boolean
                           },
"can_create_in_group":
{ Args: { "p_group": string }; Returns: boolean
                           },
"can_edit_activity":
{ Args: { "p_activity": string }; Returns: boolean
                           },
"can_edit_group_content":
{ Args: { "p_group": string }; Returns: boolean
                           },
"can_request_join":
{ Args: { "p_group": string }; Returns: boolean
                           },
"can_view_profile_field":
{ Args: { "field": string,"owner": string,"viewer": string }; Returns: boolean
                           },
"decide_join_request":
{ Args: { "p_approve": boolean,"p_request": string }; Returns: Database["public"]['Enums']["join_request_status"]
                           },
"get_profile":
{ Args: { "owner": string }; Returns: {
              "ai_risks": string,"ai_safety_knowledge": string,"bio": string,"city": string,"display_name": string,"email": string,"first_active_at": string,"id": string,"joined_at": string,"last_login_at": string,"level": Database["public"]['Enums']["user_level"],"linkedin_url": string,"real_name": string
            }[]
                           },
"get_working_group":
{ Args: { "p_slug": string }; Returns: {
              "archived": boolean,"description": string,"docs_url": string,"id": string,"is_member": boolean,"lead_display_name": string,"lead_user_id": string,"name": string,"signal_url": string,"slug": string
            }[]
                           },
"is_active_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_active_working_group":
{ Args: { "p_group": string }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_wg_member":
{ Args: { "p_group": string,"p_user"?: string }; Returns: boolean
                           },
"join_activity":
{ Args: { "p_activity": string,"p_role": Database["public"]['Enums']["participant_role"] }; Returns: undefined
                           },
"leave_activity":
{ Args: { "p_activity": string }; Returns: boolean
                           },
"list_group_activities":
{ Args: { "p_group": string }; Returns: {
              "archived": boolean,"id": string,"is_general": boolean,"key_activity": boolean,"status": Database["public"]['Enums']["activity_status"],"title": string,"type": string
            }[]
                           },
"list_working_groups":
{ Args: Record<PropertyKey, never>; Returns: {
              "archived": boolean,"description": string,"id": string,"is_member": boolean,"lead_display_name": string,"lead_user_id": string,"name": string,"slug": string
            }[]
                           },
"pending_join_request_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"profile_field_default_tier":
{ Args: { "field": string }; Returns: string
                           },
"save_postmortem":
{ Args: { "p_activity": string,"p_improvements": string,"p_learnings": string,"p_went_well": string }; Returns: undefined
                           },
"set_activity_lead":
{ Args: { "p_activity": string,"p_user": string }; Returns: undefined
                           },
"set_own_locale":
{ Args: { "new_locale": string }; Returns: undefined
                           },
"shares_working_group":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"update_own_profile":
{ Args: { "ai_risks": string,"ai_safety_knowledge": string,"bio": string,"city": string,"display_name": string,"linkedin_url": string }; Returns: undefined
                           },
"wg_member_level":
{ Args: { "p_group": string }; Returns: Database["public"]['Enums']["user_level"]
                           }
          }
          Enums: {
            "activity_status": "planned"|"active"|"done"|"cancelled","application_status": "pending"|"approved"|"rejected","data_request_kind": "export"|"deletion","data_request_status": "open"|"done","heard_source": "global_website"|"italian_website"|"word_of_mouth"|"other","join_request_status": "pending"|"approved"|"rejected","onboarding_confirmer": "self"|"auto"|"admin","participant_role": "participant"|"observer","task_status": "open"|"in_progress"|"done","user_level": "new"|"fresh"|"experienced","user_status": "active"|"deactivated"
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
            "activity_status": ["planned", "active", "done", "cancelled"],"application_status": ["pending", "approved", "rejected"],"data_request_kind": ["export", "deletion"],"data_request_status": ["open", "done"],"heard_source": ["global_website", "italian_website", "word_of_mouth", "other"],"join_request_status": ["pending", "approved", "rejected"],"onboarding_confirmer": ["self", "auto", "admin"],"participant_role": ["participant", "observer"],"task_status": ["open", "in_progress", "done"],"user_level": ["new", "fresh", "experienced"],"user_status": ["active", "deactivated"]
          }
        }
} as const
