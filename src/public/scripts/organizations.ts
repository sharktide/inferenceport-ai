async function el(id: string) { return document.getElementById(id)!; }

async function loadOrgs() {
  const out = await window.auth.getOrganizations();
  const list = document.getElementById('org-list')!;
  list.innerHTML = '';
  if (!out || out.error) {
    list.textContent = out?.error || 'Failed to load organizations';
    return;
  }
  const orgs = out.organizations || [];
  if (orgs.length === 0) {
    list.textContent = 'You are not a member of any organizations.';
    return;
  }

  for (const org of orgs) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${org.name} <small class="muted">(${org.slug})</small></h3>
      <div id="org-${org.id}-members"></div>
      <div class="row">
        <input id="invite-email-${org.id}" placeholder="Invite email" />
        <button id="invite-btn-${org.id}">Create Invite</button>
        <span id="invite-code-${org.id}" class="muted"></span>
      </div>
      <div class="row">
        <button id="refresh-members-${org.id}">Refresh Members</button>
        <button id="delete-org-${org.id}">Delete Organization</button>
      </div>
    `;
    list.appendChild(card);

    (document.getElementById(`invite-btn-${org.id}`) as HTMLButtonElement).onclick = async () => {
      const email = (document.getElementById(`invite-email-${org.id}`) as HTMLInputElement).value;
      const res = await window.auth.inviteMember({ organizationId: org.id, email });
      const span = document.getElementById(`invite-code-${org.id}`)!;
      if (res?.error) {
        span.textContent = `Error: ${res.error}`;
        return;
      }
      const token = res.invitation?.token;
      span.textContent = token ? `Code: ${token}` : 'Invite created';
    };

    (document.getElementById(`refresh-members-${org.id}`) as HTMLButtonElement).onclick = async () => {
      await renderMembers(org.id);
    };

    (document.getElementById(`delete-org-${org.id}`) as HTMLButtonElement).onclick = async () => {
      if (!confirm(`Delete organization ${org.name}? This cannot be undone.`)) return;
      const res = await window.auth.deleteOrganization({ organizationId: org.id });
      if (res?.error) return alert(res.error);
      await loadOrgs();
    };

    // initial members render
    await renderMembers(org.id);
  }
}

async function renderMembers(orgId: string) {
  const target = document.getElementById(`org-${orgId}-members`)!;
  target.textContent = 'Loading members...';
  const res = await window.auth.getMembers(orgId);
  if (res?.error) { target.textContent = `Error: ${res.error}`; return; }
  const members = res.members || [];
  const list = document.createElement('div');
  for (const m of members) {
    const item = document.createElement('div');
    item.className = 'muted';
    const username = (m as any).profiles?.username || m.user_id;
    item.innerHTML = `
      <div>${username} — ${m.role}
        <select id="role-${orgId}-${m.user_id}">
          <option value="member" ${m.role==='member' ? 'selected':''}>member</option>
          <option value="admin" ${m.role==='admin' ? 'selected':''}>admin</option>
          <option value="owner" ${m.role==='owner' ? 'selected':''}>owner</option>
        </select>
        <button id="setrole-${orgId}-${m.user_id}">Set Role</button>
        <button id="rem-${orgId}-${m.user_id}">Remove</button>
      </div>
    `;
    list.appendChild(item);

    (item.querySelector(`#setrole-${orgId}-${m.user_id}`) as HTMLButtonElement).onclick = async () => {
      const sel = (document.getElementById(`role-${orgId}-${m.user_id}`) as HTMLSelectElement).value;
      const r = await window.auth.setMemberRole({ organizationId: orgId, userId: m.user_id, role: sel });
      if (r?.error) return alert(r.error);
      await renderMembers(orgId);
    };

    (item.querySelector(`#rem-${orgId}-${m.user_id}`) as HTMLButtonElement).onclick = async () => {
      if (!confirm('Remove member?')) return;
      const r = await window.auth.removeMember({ organizationId: orgId, userId: m.user_id });
      if (r?.error) return alert(r.error);
      await renderMembers(orgId);
    };
  }
  target.innerHTML = '';
  target.appendChild(list);
}

window.addEventListener('DOMContentLoaded', async () => {
  (document.getElementById('create-org-btn') as HTMLButtonElement).onclick = async () => {
    const name = (document.getElementById('org-name') as HTMLInputElement).value;
    const slug = (document.getElementById('org-slug') as HTMLInputElement).value;
    const res = await window.auth.createOrganization({ name, slug });
    const out = document.getElementById('create-result')!;
    if (res?.error) { out.textContent = `Error: ${res.error}`; return; }
    out.textContent = `Organization created: ${res.organization?.name}`;
    await loadOrgs();
  };

  (document.getElementById('accept-invite-btn') as HTMLButtonElement).onclick = async () => {
    const token = (document.getElementById('invite-code') as HTMLInputElement).value;
    const res = await window.auth.acceptInvite(token);
    const out = document.getElementById('accept-result')!;
    if (res?.error) { out.textContent = `Error: ${res.error}`; return; }
    out.textContent = 'Joined organization successfully';
    await loadOrgs();
  };

  await loadOrgs();
});
