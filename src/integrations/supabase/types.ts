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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_enrollments: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          default_type: Database["public"]["Enums"]["endpoint_type"]
          expires_at: string
          id: string
          tenant_id: string
          token: string
          used_at: string | null
          used_endpoint_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          default_type?: Database["public"]["Enums"]["endpoint_type"]
          expires_at?: string
          id?: string
          tenant_id: string
          token: string
          used_at?: string | null
          used_endpoint_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          default_type?: Database["public"]["Enums"]["endpoint_type"]
          expires_at?: string
          id?: string
          tenant_id?: string
          token?: string
          used_at?: string | null
          used_endpoint_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_enrollments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_enrollments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_enrollments_used_endpoint_id_fkey"
            columns: ["used_endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          client_id: string | null
          comparator: Database["public"]["Enums"]["alert_comparator"]
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          enabled: boolean
          endpoint_id: string | null
          id: string
          metric: Database["public"]["Enums"]["alert_metric"]
          name: string
          notify_email: string | null
          scope: Database["public"]["Enums"]["alert_scope"]
          severity: Database["public"]["Enums"]["alert_severity"]
          tenant_id: string
          threshold: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          comparator?: Database["public"]["Enums"]["alert_comparator"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          enabled?: boolean
          endpoint_id?: string | null
          id?: string
          metric: Database["public"]["Enums"]["alert_metric"]
          name: string
          notify_email?: string | null
          scope?: Database["public"]["Enums"]["alert_scope"]
          severity?: Database["public"]["Enums"]["alert_severity"]
          tenant_id: string
          threshold?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          comparator?: Database["public"]["Enums"]["alert_comparator"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          enabled?: boolean
          endpoint_id?: string | null
          id?: string
          metric?: Database["public"]["Enums"]["alert_metric"]
          name?: string
          notify_email?: string | null
          scope?: Database["public"]["Enums"]["alert_scope"]
          severity?: Database["public"]["Enums"]["alert_severity"]
          tenant_id?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          client_id: string | null
          created_at: string
          endpoint_id: string | null
          id: string
          message: string
          metric: Database["public"]["Enums"]["alert_metric"]
          resolved_at: string | null
          rule_id: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          status: Database["public"]["Enums"]["alert_status"]
          tenant_id: string
          threshold: number | null
          updated_at: string
          value: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          client_id?: string | null
          created_at?: string
          endpoint_id?: string | null
          id?: string
          message: string
          metric: Database["public"]["Enums"]["alert_metric"]
          resolved_at?: string | null
          rule_id?: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          tenant_id: string
          threshold?: number | null
          updated_at?: string
          value?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          client_id?: string | null
          created_at?: string
          endpoint_id?: string | null
          id?: string
          message?: string
          metric?: Database["public"]["Enums"]["alert_metric"]
          resolved_at?: string | null
          rule_id?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"]
          tenant_id?: string
          threshold?: number | null
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string
          id: string
          new_values: Json | null
          old_values: Json | null
          summary: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          summary?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          summary?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          automation_id: string
          client_id: string | null
          created_at: string
          duration_ms: number | null
          endpoint_id: string | null
          error: string | null
          exit_code: number | null
          finished_at: string | null
          id: string
          output: string | null
          started_at: string
          status: Database["public"]["Enums"]["automation_run_status"]
          tenant_id: string
          trigger_source: Database["public"]["Enums"]["automation_trigger"]
          triggered_by: string | null
        }
        Insert: {
          automation_id: string
          client_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint_id?: string | null
          error?: string | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          output?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["automation_run_status"]
          tenant_id: string
          trigger_source?: Database["public"]["Enums"]["automation_trigger"]
          triggered_by?: string | null
        }
        Update: {
          automation_id?: string
          client_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint_id?: string | null
          error?: string | null
          exit_code?: number | null
          finished_at?: string | null
          id?: string
          output?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["automation_run_status"]
          tenant_id?: string
          trigger_source?: Database["public"]["Enums"]["automation_trigger"]
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          client_id: string | null
          code: string
          created_at: string
          created_by: string | null
          cron_expr: string | null
          description: string | null
          enabled: boolean
          endpoint_id: string | null
          id: string
          kind: Database["public"]["Enums"]["automation_kind"]
          language: Database["public"]["Enums"]["automation_language"]
          name: string
          notify_email: string | null
          scope: Database["public"]["Enums"]["automation_scope"]
          tenant_id: string
          trigger: Database["public"]["Enums"]["automation_trigger"]
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          cron_expr?: string | null
          description?: string | null
          enabled?: boolean
          endpoint_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["automation_kind"]
          language?: Database["public"]["Enums"]["automation_language"]
          name: string
          notify_email?: string | null
          scope?: Database["public"]["Enums"]["automation_scope"]
          tenant_id: string
          trigger?: Database["public"]["Enums"]["automation_trigger"]
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          cron_expr?: string | null
          description?: string | null
          enabled?: boolean
          endpoint_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["automation_kind"]
          language?: Database["public"]["Enums"]["automation_language"]
          name?: string
          notify_email?: string | null
          scope?: Database["public"]["Enums"]["automation_scope"]
          tenant_id?: string
          trigger?: Database["public"]["Enums"]["automation_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          role: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          role?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          role?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address_line: string | null
          city: string | null
          contract_end: string | null
          contract_start: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          sla_tier: Database["public"]["Enums"]["sla_tier"]
          state: string | null
          status: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          contract_end?: string | null
          contract_start?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          sla_tier?: Database["public"]["Enums"]["sla_tier"]
          state?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line?: string | null
          city?: string | null
          contract_end?: string | null
          contract_start?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          sla_tier?: Database["public"]["Enums"]["sla_tier"]
          state?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          tenant_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_items: {
        Row: {
          contract_id: string
          created_at: string
          description: string
          discount_pct: number
          id: string
          quantity: number
          service_id: string | null
          tenant_id: string
          unit_price: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          description: string
          discount_pct?: number
          id?: string
          quantity?: number
          service_id?: string | null
          tenant_id: string
          unit_price?: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          description?: string
          discount_pct?: number
          id?: string
          quantity?: number
          service_id?: string | null
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          auto_renew: boolean
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          end_date: string | null
          id: string
          monthly_value: number
          name: string
          notes: string | null
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          end_date?: string | null
          id?: string
          monthly_value?: number
          name: string
          notes?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          end_date?: string | null
          id?: string
          monthly_value?: number
          name?: string
          notes?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoint_commands: {
        Row: {
          command: Database["public"]["Enums"]["endpoint_command_type"]
          completed_at: string | null
          created_at: string
          endpoint_id: string
          id: string
          output: string | null
          params: Json
          requested_by: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["endpoint_command_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          command: Database["public"]["Enums"]["endpoint_command_type"]
          completed_at?: string | null
          created_at?: string
          endpoint_id: string
          id?: string
          output?: string | null
          params?: Json
          requested_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["endpoint_command_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          command?: Database["public"]["Enums"]["endpoint_command_type"]
          completed_at?: string | null
          created_at?: string
          endpoint_id?: string
          id?: string
          output?: string | null
          params?: Json
          requested_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["endpoint_command_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "endpoint_commands_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoint_commands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoint_metric_samples: {
        Row: {
          cpu_usage: number | null
          disk_usage: number | null
          endpoint_id: string
          id: number
          ram_usage: number | null
          sampled_at: string
          tenant_id: string
        }
        Insert: {
          cpu_usage?: number | null
          disk_usage?: number | null
          endpoint_id: string
          id?: number
          ram_usage?: number | null
          sampled_at?: string
          tenant_id: string
        }
        Update: {
          cpu_usage?: number | null
          disk_usage?: number | null
          endpoint_id?: string
          id?: number
          ram_usage?: number | null
          sampled_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "endpoint_metric_samples_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoint_secrets: {
        Row: {
          agent_token: string
          created_at: string
          endpoint_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_token: string
          created_at?: string
          endpoint_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_token?: string
          created_at?: string
          endpoint_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "endpoint_secrets_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: true
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoint_secrets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      endpoints: {
        Row: {
          agent_version: string | null
          bios_date: string | null
          bios_vendor: string | null
          bios_version: string | null
          client_id: string
          cpu_cores: number | null
          cpu_model: string | null
          cpu_threads: number | null
          cpu_usage: number | null
          created_at: string
          disk_usage: number | null
          disks: Json
          dns_servers: Json
          domain: string | null
          gateway: string | null
          gpu: string | null
          hostname: string
          id: string
          installed_software: Json
          inventory_updated_at: string | null
          ip_address: string | null
          last_boot_at: string | null
          last_heartbeat: string | null
          last_seen_ip: string | null
          logged_user: string | null
          mac_address: string | null
          manufacturer: string | null
          model: string | null
          motherboard: string | null
          network_interfaces: Json
          notes: string | null
          os: string | null
          os_version: string | null
          pending_updates: Json
          public_ip: string | null
          ram_total_mb: number | null
          ram_usage: number | null
          running_processes: Json
          serial_number: string | null
          services: Json
          status: Database["public"]["Enums"]["endpoint_status"]
          tags: string[]
          tailscale_ip: string | null
          tenant_id: string
          timezone: string | null
          type: Database["public"]["Enums"]["endpoint_type"]
          updated_at: string
          uptime_seconds: number | null
        }
        Insert: {
          agent_version?: string | null
          bios_date?: string | null
          bios_vendor?: string | null
          bios_version?: string | null
          client_id: string
          cpu_cores?: number | null
          cpu_model?: string | null
          cpu_threads?: number | null
          cpu_usage?: number | null
          created_at?: string
          disk_usage?: number | null
          disks?: Json
          dns_servers?: Json
          domain?: string | null
          gateway?: string | null
          gpu?: string | null
          hostname: string
          id?: string
          installed_software?: Json
          inventory_updated_at?: string | null
          ip_address?: string | null
          last_boot_at?: string | null
          last_heartbeat?: string | null
          last_seen_ip?: string | null
          logged_user?: string | null
          mac_address?: string | null
          manufacturer?: string | null
          model?: string | null
          motherboard?: string | null
          network_interfaces?: Json
          notes?: string | null
          os?: string | null
          os_version?: string | null
          pending_updates?: Json
          public_ip?: string | null
          ram_total_mb?: number | null
          ram_usage?: number | null
          running_processes?: Json
          serial_number?: string | null
          services?: Json
          status?: Database["public"]["Enums"]["endpoint_status"]
          tags?: string[]
          tailscale_ip?: string | null
          tenant_id: string
          timezone?: string | null
          type?: Database["public"]["Enums"]["endpoint_type"]
          updated_at?: string
          uptime_seconds?: number | null
        }
        Update: {
          agent_version?: string | null
          bios_date?: string | null
          bios_vendor?: string | null
          bios_version?: string | null
          client_id?: string
          cpu_cores?: number | null
          cpu_model?: string | null
          cpu_threads?: number | null
          cpu_usage?: number | null
          created_at?: string
          disk_usage?: number | null
          disks?: Json
          dns_servers?: Json
          domain?: string | null
          gateway?: string | null
          gpu?: string | null
          hostname?: string
          id?: string
          installed_software?: Json
          inventory_updated_at?: string | null
          ip_address?: string | null
          last_boot_at?: string | null
          last_heartbeat?: string | null
          last_seen_ip?: string | null
          logged_user?: string | null
          mac_address?: string | null
          manufacturer?: string | null
          model?: string | null
          motherboard?: string | null
          network_interfaces?: Json
          notes?: string | null
          os?: string | null
          os_version?: string | null
          pending_updates?: Json
          public_ip?: string | null
          ram_total_mb?: number | null
          ram_usage?: number | null
          running_processes?: Json
          serial_number?: string | null
          services?: Json
          status?: Database["public"]["Enums"]["endpoint_status"]
          tags?: string[]
          tailscale_ip?: string | null
          tenant_id?: string
          timezone?: string | null
          type?: Database["public"]["Enums"]["endpoint_type"]
          updated_at?: string
          uptime_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "endpoints_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_counters: {
        Row: {
          last_number: number
          tenant_id: string
        }
        Insert: {
          last_number?: number
          tenant_id: string
        }
        Update: {
          last_number?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          tenant_id: string
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          tenant_id: string
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          tenant_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_date: string
          id: string
          issue_date: string
          notes: string | null
          number: string
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          client_id: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          number: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          number?: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          author_id: string | null
          body: string
          category: string | null
          client_id: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["kb_status"]
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          views: number
          visibility: Database["public"]["Enums"]["kb_visibility"]
        }
        Insert: {
          author_id?: string | null
          body?: string
          category?: string | null
          client_id?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["kb_status"]
          tags?: string[]
          tenant_id: string
          title: string
          updated_at?: string
          views?: number
          visibility?: Database["public"]["Enums"]["kb_visibility"]
        }
        Update: {
          author_id?: string | null
          body?: string
          category?: string | null
          client_id?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["kb_status"]
          tags?: string[]
          tenant_id?: string
          title?: string
          updated_at?: string
          views?: number
          visibility?: Database["public"]["Enums"]["kb_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          client_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          status: Database["public"]["Enums"]["user_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          client_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          status?: Database["public"]["Enums"]["user_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          client_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          status?: Database["public"]["Enums"]["user_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          name: string
          tax_rate: number
          tenant_id: string
          unit: Database["public"]["Enums"]["service_unit"]
          unit_price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          tax_rate?: number
          tenant_id: string
          unit?: Database["public"]["Enums"]["service_unit"]
          unit_price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          tax_rate?: number
          tenant_id?: string
          unit?: Database["public"]["Enums"]["service_unit"]
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      ticket_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          field: string | null
          id: string
          new_value: string | null
          old_value: string | null
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          tenant_id: string
          ticket_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_activity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_activity_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          internal: boolean
          tenant_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          internal?: boolean
          tenant_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          internal?: boolean
          tenant_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_counters: {
        Row: {
          last_number: number
          tenant_id: string
        }
        Insert: {
          last_number?: number
          tenant_id: string
        }
        Update: {
          last_number?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assignee_id: string | null
          category: Database["public"]["Enums"]["ticket_category"]
          client_id: string
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          endpoint_id: string | null
          id: string
          number: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolved_at: string | null
          sla_due_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          client_id: string
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          endpoint_id?: string | null
          id?: string
          number: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          sla_due_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          tags?: string[]
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          client_id?: string
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          endpoint_id?: string | null
          id?: string
          number?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          sla_due_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          tags?: string[]
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      evaluate_alert_rules: { Args: never; Returns: number }
      generate_invoice_from_contract: {
        Args: {
          _contract_id: string
          _period_end?: string
          _period_start?: string
        }
        Returns: string
      }
      get_user_client: { Args: { _user_id: string }; Returns: string }
      get_user_tenant: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_invoice_paid: { Args: { _invoice_id: string }; Returns: undefined }
      run_automation: { Args: { _automation_id: string }; Returns: number }
    }
    Enums: {
      alert_comparator: "gt" | "gte" | "lt" | "lte"
      alert_metric: "cpu" | "ram" | "disk" | "offline"
      alert_scope: "all" | "client" | "endpoint"
      alert_severity: "info" | "warning" | "critical"
      alert_status: "open" | "acknowledged" | "resolved"
      app_role: "admin" | "technician" | "viewer" | "portal"
      automation_kind: "script" | "task"
      automation_language: "powershell" | "bash" | "python"
      automation_run_status:
        | "queued"
        | "running"
        | "success"
        | "failed"
        | "cancelled"
      automation_scope: "all" | "client" | "endpoint"
      automation_trigger: "manual" | "schedule" | "alert"
      billing_cycle: "one_time" | "monthly" | "quarterly" | "yearly"
      client_status: "active" | "inactive" | "prospect"
      contract_status: "draft" | "active" | "suspended" | "ended" | "cancelled"
      endpoint_command_status:
        | "pending"
        | "sent"
        | "succeeded"
        | "failed"
        | "cancelled"
      endpoint_command_type:
        | "shutdown"
        | "restart"
        | "sleep"
        | "hibernate"
        | "wake_on_lan"
        | "logoff"
        | "enable_rdp"
      endpoint_status: "online" | "offline" | "warning" | "critical"
      endpoint_type: "workstation" | "server" | "mobile" | "network"
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "void"
      kb_status: "draft" | "published" | "archived"
      kb_visibility: "internal" | "public"
      service_unit: "hour" | "month" | "endpoint" | "user" | "license" | "fixed"
      sla_tier: "bronze" | "silver" | "gold" | "platinum"
      ticket_category:
        | "incident"
        | "request"
        | "problem"
        | "change"
        | "question"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status: "open" | "in_progress" | "waiting" | "resolved" | "closed"
      user_status: "pending" | "active" | "disabled"
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
    Enums: {
      alert_comparator: ["gt", "gte", "lt", "lte"],
      alert_metric: ["cpu", "ram", "disk", "offline"],
      alert_scope: ["all", "client", "endpoint"],
      alert_severity: ["info", "warning", "critical"],
      alert_status: ["open", "acknowledged", "resolved"],
      app_role: ["admin", "technician", "viewer", "portal"],
      automation_kind: ["script", "task"],
      automation_language: ["powershell", "bash", "python"],
      automation_run_status: [
        "queued",
        "running",
        "success",
        "failed",
        "cancelled",
      ],
      automation_scope: ["all", "client", "endpoint"],
      automation_trigger: ["manual", "schedule", "alert"],
      billing_cycle: ["one_time", "monthly", "quarterly", "yearly"],
      client_status: ["active", "inactive", "prospect"],
      contract_status: ["draft", "active", "suspended", "ended", "cancelled"],
      endpoint_command_status: [
        "pending",
        "sent",
        "succeeded",
        "failed",
        "cancelled",
      ],
      endpoint_command_type: [
        "shutdown",
        "restart",
        "sleep",
        "hibernate",
        "wake_on_lan",
        "logoff",
        "enable_rdp",
      ],
      endpoint_status: ["online", "offline", "warning", "critical"],
      endpoint_type: ["workstation", "server", "mobile", "network"],
      invoice_status: ["draft", "sent", "paid", "overdue", "void"],
      kb_status: ["draft", "published", "archived"],
      kb_visibility: ["internal", "public"],
      service_unit: ["hour", "month", "endpoint", "user", "license", "fixed"],
      sla_tier: ["bronze", "silver", "gold", "platinum"],
      ticket_category: ["incident", "request", "problem", "change", "question"],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: ["open", "in_progress", "waiting", "resolved", "closed"],
      user_status: ["pending", "active", "disabled"],
    },
  },
} as const
