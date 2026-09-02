CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text,
	"table_name" text NOT NULL,
	"record_id" text,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"summary" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_id" integer NOT NULL,
	"alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	CONSTRAINT "contents_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "grades_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT '기타 기관' NOT NULL,
	"region" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "instructors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"grade_id" integer,
	"phone" text,
	"region" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "lectures" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"instructor_id" integer NOT NULL,
	"institution_id" integer NOT NULL,
	"content" text,
	"content_raw" text,
	"sessions" double precision,
	"role" text DEFAULT '주강사' NOT NULL,
	"pay_type" text,
	"manual_price" integer,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"gross_amount" integer DEFAULT 0 NOT NULL,
	"net_amount" integer DEFAULT 0 NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"paidAt" timestamp with time zone,
	"is_done" boolean DEFAULT false NOT NULL,
	"headcount" integer,
	"note" text,
	"created_by" text,
	"updated_by" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"rate_table_id" integer NOT NULL,
	"grade_id" integer NOT NULL,
	"pay_type" text NOT NULL,
	"role" text,
	"amount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"effective_from" date NOT NULL,
	"memo" text,
	"created_by" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_locks" (
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"locked_by" text,
	"lockedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_locks_year_month_pk" PRIMARY KEY("year","month")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'admin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"lastLoginAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "content_aliases" ADD CONSTRAINT "content_aliases_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_items" ADD CONSTRAINT "rate_items_rate_table_id_rate_tables_id_fk" FOREIGN KEY ("rate_table_id") REFERENCES "public"."rate_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_items" ADD CONSTRAINT "rate_items_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_at_idx" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_aliases_alias_uq" ON "content_aliases" USING btree ("alias");--> statement-breakpoint
CREATE INDEX "instructors_grade_idx" ON "instructors" USING btree ("grade_id");--> statement-breakpoint
CREATE INDEX "lectures_date_idx" ON "lectures" USING btree ("date");--> statement-breakpoint
CREATE INDEX "lectures_instructor_date_idx" ON "lectures" USING btree ("instructor_id","date");--> statement-breakpoint
CREATE INDEX "lectures_institution_idx" ON "lectures" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "rate_items_table_idx" ON "rate_items" USING btree ("rate_table_id");