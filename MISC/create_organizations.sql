-- Migration: create organizations, organization_members, organization_invitations
-- Run in Supabase SQL editor or psql against the project's database

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Organization members
CREATE TABLE IF NOT EXISTS organization_members (
    organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member', -- roles: owner, admin, member
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

-- Invitations
CREATE TABLE IF NOT EXISTS organization_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
    email text NOT NULL,
    invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    token text NOT NULL UNIQUE,
    accepted boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz
);

-- Trigger to update organizations.updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organizations_updated_at ON organizations;
CREATE TRIGGER organizations_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_owner ON organizations(owner);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_invites_org ON organization_invitations(organization_id);

-- Enable RLS and create policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Organizations policies
CREATE POLICY IF NOT EXISTS "org_select_for_members_or_owner" ON organizations
    FOR SELECT USING (
        owner = auth.uid()
        OR EXISTS (
            SELECT 1 FROM organization_members om WHERE om.organization_id = organizations.id AND om.user_id = auth.uid()
        )
    );

CREATE POLICY IF NOT EXISTS "org_insert_owner_is_caller" ON organizations
    FOR INSERT WITH CHECK (owner = auth.uid());

CREATE POLICY IF NOT EXISTS "org_update_owner_only" ON organizations
    FOR UPDATE USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());

CREATE POLICY IF NOT EXISTS "org_delete_owner_only" ON organizations
    FOR DELETE USING (owner = auth.uid());

-- Organization members policies
CREATE POLICY IF NOT EXISTS "members_select_if_member" ON organization_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM organization_members om2 WHERE om2.organization_id = organization_members.organization_id AND om2.user_id = auth.uid()
        )
        OR organization_members.user_id = auth.uid()
    );

CREATE POLICY IF NOT_EXISTS "members_insert_admin_or_owner" ON organization_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM organizations o
            WHERE o.id = organization_members.organization_id AND (
                o.owner = auth.uid() OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = o.id AND om.user_id = auth.uid() AND om.role IN ('owner','admin'))
            )
        )
    );

CREATE POLICY IF NOT EXISTS "members_update_admin_or_owner" ON organization_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM organizations o
            WHERE o.id = organization_members.organization_id AND (
                o.owner = auth.uid() OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = o.id AND om.user_id = auth.uid() AND om.role IN ('owner','admin'))
            )
        )
    ) WITH CHECK (TRUE);

CREATE POLICY IF NOT EXISTS "members_delete_admin_or_owner" ON organization_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM organizations o
            WHERE o.id = organization_members.organization_id AND (
                o.owner = auth.uid() OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = o.id AND om.user_id = auth.uid() AND om.role IN ('owner','admin'))
            )
        )
    );

-- Invitations policies
CREATE POLICY IF NOT EXISTS "invites_select_for_members" ON organization_invitations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM organization_members om WHERE om.organization_id = organization_invitations.organization_id AND om.user_id = auth.uid()
        )
    );

CREATE POLICY IF NOT EXISTS "invites_insert_for_members" ON organization_invitations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om WHERE om.organization_id = organization_invitations.organization_id AND om.user_id = auth.uid() AND om.role IN ('owner','admin')
        )
    );

CREATE POLICY IF NOT EXISTS "invites_delete_for_members" ON organization_invitations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM organization_members om WHERE om.organization_id = organization_invitations.organization_id AND om.user_id = auth.uid() AND om.role IN ('owner','admin')
        )
    );
