const closeBtn = document.getElementById(
	"close-org-settings",
) as HTMLButtonElement;
const modal = document.getElementById("org-settings-modal") as HTMLDivElement;

closeBtn.onclick = () => {
	modal.classList.add("hidden");
};

type Org = {
	id: string;
	name: string;
	slug: string;
};

type Member = {
	user_id: string;
	role: "member" | "admin" | "owner";
	profiles?: { username?: string };
};

type AuthResult<T = unknown> = { error?: string } & T;

interface AuthAPI {
	getOrganizations(): Promise<AuthResult<{ organizations: Org[] }>>;
	createOrganization(input: {
		name: string;
		slug: string;
	}): Promise<AuthResult<{ organization?: Org }>>;
	deleteOrganization(input: { organizationId: string }): Promise<AuthResult>;
	inviteMember(input: {
		organizationId: string;
		email: string;
	}): Promise<AuthResult<{ invitation?: { token?: string } }>>;
	acceptInvite(token: string): Promise<AuthResult>;
	getMembers(orgId: string): Promise<AuthResult<{ members: Member[] }>>;
	setMemberRole(input: {
		organizationId: string;
		userId: string;
		role: Member["role"];
	}): Promise<AuthResult>;
	removeMember(input: {
		organizationId: string;
		userId: string;
	}): Promise<AuthResult>;
}

function escapeHtml(str: unknown): string {
	if (!str) return "";
	return String(str).replace(
		/[&<>"']/g,
		(m) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[m]!,
	);
}

async function getMyRole(orgId: string): Promise<Member["role"]> {
  const { session, error } = await window.auth.getSession();
  if (!session || error) throw new Error("Not authenticated");

  const res = await window.auth.getMembers(orgId);
  if (res?.error) throw new Error(res.error);

  const me = res.members?.find(
    (m) => m.user_id === session.user.id,
  );
  //@ts-ignore
  return me?.role ?? "member";
}

async function loadOrgs(): Promise<void> {
	const out = await window.auth.getOrganizations();
	const list = document.getElementById("org-list")!;
	list.innerHTML = "";

	if (!out || out.error) {
		list.textContent = out?.error ?? "Failed to load organizations";
		return;
	}

	const orgs = out.organizations ?? [];
	if (orgs.length === 0) {
		list.textContent = "You are not a member of any organizations.";
		return;
	}

	for (const org of orgs) {
		const card = document.createElement("div");
		card.className = "org-card";
		card.innerHTML = `
      <h2>${escapeHtml(org.name)} <small class="muted">(${escapeHtml(org.slug)})</small></h2>
      <button class="settings-btn">Settings</button>
      <div id="org-${org.id}-members" class="members-list"></div>
    `;
		list.appendChild(card);

		const settingsBtn = card.querySelector(
			".settings-btn",
		) as HTMLButtonElement;
		console.log(settingsBtn)
    settingsBtn.addEventListener("click", () => {
       openOrgSettings(org.id);
    });

		await renderMembers(org.id);
		await renderMembersInOrgList(org.id);
	}
}

async function openOrgSettings(orgId: string): Promise<void> {
  console.log("Opening settings for org:", orgId);
  const modal = document.getElementById(
    "org-settings-modal",
  ) as HTMLDivElement;

  const role = await getMyRole(orgId);

  if (role === "member") {
    alert("Access not permitted");
    return;
  }

  modal.classList.remove("hidden");

  const refreshBtn = document.getElementById(
    "refresh-members-btn",
  ) as HTMLButtonElement;
  const deleteBtn = document.getElementById(
    "delete-org-btn",
  ) as HTMLButtonElement;
  const inviteBtn = document.getElementById(
    "invite-user-btn",
  ) as HTMLButtonElement;

  // UI permissions
  deleteBtn.style.display = role === "owner" ? "inline-block" : "none";
  //@ts-ignore
  inviteBtn.style.display = role !== "member" ? "inline-block" : "none";

  refreshBtn.onclick = async () => {
    await renderMembers(orgId);
  };

  deleteBtn.onclick = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this organization? This action cannot be undone.",
      )
    )
      return;

    const res = await window.auth.deleteOrganization({
      organizationId: orgId,
    });

    if (res?.error) {
      alert(res.error);
      return;
    }

    modal.classList.add("hidden");
    await loadOrgs();
  };

  inviteBtn.onclick = () => {
    const inviteModal = document.getElementById(
      "invite-modal",
    ) as HTMLDivElement;
    inviteModal.classList.remove("hidden");
    inviteModal.dataset.orgid = orgId;
  };

  await renderMembers(orgId);
}


async function renderMembers(orgId: string): Promise<void> {
	const target = document.getElementById("org-members-list");
	const { session, error } = await window.auth.getSession();
	if (!session || error) {
		throw new Error("Failed to get current user session.");
	}
	const currentUserId = await session.user.id;
	let currentUserRole: Member["role"] | null = null;

	if (!target) {
		console.error(`Element with ID org-members-list not found.`);
		return;
	}

	target.textContent = "Loading members...";

	const res = await window.auth.getMembers(orgId);
	if (res?.error) {
		target.textContent = `Error: ${res.error}`;
		return;
	}

	const members = res.members ?? [];
	const list = document.createElement("div");

	for (const m of members) {
		const username = m.profiles?.username ?? m.user_id;
		const item = document.createElement("div");
		if (m.user_id === currentUserId) {
			//@ts-ignore
			currentUserRole = m.role;
		}

		const isSelf = m.user_id === currentUserId;
		const isOwner = currentUserRole === "owner";
		const isAdmin = currentUserRole === "admin";

		item.innerHTML = `
      <span>${escapeHtml(username)} — ${escapeHtml(m.role)}</span>
      <select id="role-${orgId}-${m.user_id}" ${currentUserRole === "member" ? "disabled" : ""}>
        <option value="member" ${m.role === "member" ? "selected" : ""}>member</option>
        <option value="admin" ${m.role === "admin" ? "selected" : ""}>admin</option>
        <option value="owner" ${m.role === "owner" ? "selected" : ""}>owner</option>
      </select>
      <a class="delete-link" id="rem-${orgId}-${m.user_id}">Remove</a>
    `;
		list.appendChild(item);

		const select = item.querySelector(
			`#role-${orgId}-${m.user_id}`,
		) as HTMLSelectElement;

		select.value = m.role;

		select.onchange = async () => {
			const newRole = select.value as Member["role"];
			const oldRole = select.dataset.original as Member["role"];

			if (newRole === oldRole) return;

			if (isSelf && m.role === "owner" && newRole !== "owner") {
				alert("You must transfer ownership to another member first.");
				select.value = "owner";
				return;
			}

			if (newRole === "owner" && isOwner && !isSelf) {
				const ok = confirm(
					"This will transfer ownership to this user and make you an admin. Continue?",
				);
				if (!ok) {
					select.value = oldRole;
					return;
				}

				// Step 1: Promote new owner
				await window.auth.setMemberRole({
					organizationId: orgId,
					userId: m.user_id,
					role: "owner",
				});

				// Step 2: Demote self to admin
				await window.auth.setMemberRole({
					organizationId: orgId,
					userId: currentUserId!,
					role: "admin",
				});

				await renderMembers(orgId);
				return;
			}

			select.disabled = true;

			const r = await window.auth.setMemberRole({
				organizationId: orgId,
				userId: m.user_id,
				role: newRole,
			});

			if (r?.error) {
				alert(r.error);
				select.value = oldRole;
			} else {
				select.dataset.original = newRole;
			}

			select.disabled = false;
		};

		(
			item.querySelector(
				`#rem-${orgId}-${m.user_id}`,
			)! as HTMLAnchorElement
		).onclick = async () => {
			if (!confirm("Remove member?")) return;
			const r = await window.auth.removeMember({
				organizationId: orgId,
				userId: m.user_id,
			});
			if (r?.error) return alert(r.error);
			await renderMembers(orgId);
		};
	}

	target.innerHTML = "";
	target.appendChild(list);
}

async function renderMembersInOrgList(orgId: string): Promise<void> {
	const target = document.getElementById(`org-${orgId}-members`);

	if (!target) {
		console.error(`Element with ID org-${orgId}-members not found.`);
		return;
	}

	target.textContent = "Loading members...";

	const res = await window.auth.getMembers(orgId);
	if (res?.error) {
		target.textContent = `Error: ${res.error}`;
		return;
	}

	const members = res.members ?? [];
	const list = document.createElement("ul");

	for (const m of members) {
		const username = m.profiles?.username ?? m.user_id;
		const item = document.createElement("li");
		item.textContent = `${escapeHtml(username)} — ${escapeHtml(m.role)}`;
		list.appendChild(item);
	}

	target.innerHTML = "";
	target.appendChild(list);
}

window.addEventListener("DOMContentLoaded", async () => {
	(document.getElementById("create-org-btn")! as HTMLButtonElement).onclick =
		async () => {
			const name = (
				document.getElementById("org-name")! as HTMLInputElement
			).value;
			const slug = (
				document.getElementById("org-slug")! as HTMLInputElement
			).value;
			const res = await window.auth.createOrganization({ name, slug });
			const out = document.getElementById("create-result")!;
			if (res?.error) {
				out.textContent = `Error: ${res.error}`;
				return;
			}
			out.textContent = `Organization created: ${res.organization?.name}`;
			await loadOrgs();
		};

	(
		document.getElementById("accept-invite-btn")! as HTMLButtonElement
	).onclick = async () => {
		const token = (
			document.getElementById("invite-code")! as HTMLInputElement
		).value.trim();
		const out = document.getElementById("accept-result")!;
		if (!token) {
			out.textContent = "Please enter invite code.";
			return;
		}
		const res = await window.auth.acceptInvite(token);
		if (res?.error) {
			out.textContent = `Error: ${res.error}`;
			return;
		}
		out.textContent = "Joined organization successfully";
		await loadOrgs();
	};

	(document.getElementById("invite-btn")! as HTMLButtonElement).onclick =
		async () => {
			const email = (
				document.getElementById("invite-email")! as HTMLInputElement
			).value;
			const orgid = (
				document.getElementById("invite-modal") as HTMLDivElement
			).dataset.orgid!;
			const res = await window.auth.inviteMember({
				organizationId: orgid,
				email,
			});
			const inviteCode = document.getElementById(
				"invite-code",
			) as HTMLParagraphElement;
			if (res?.error) {
				inviteCode.textContent = `Error: ${res.error}`;
				return;
			}
			const token = res.invitation?.token;
			inviteCode.textContent = token
				? `Code: ${token}`
				: "Invite created";
		};

	(document.getElementById("cancel-invite")! as HTMLButtonElement).onclick =
		() => {
			(
				document.getElementById("invite-modal") as HTMLDivElement
			).classList.add("hidden");
		};

	document.querySelectorAll(".tab-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			document
				.querySelectorAll(".tab-btn")
				.forEach((b) => b.classList.remove("active"));
			btn.classList.add("active");

			document
				.querySelectorAll(".tab-panel")
				.forEach((panel) => panel.classList.remove("active"));
			const target = btn.getAttribute("data-tab");
			document.getElementById(target!)!.classList.add("active");
		});
	});

	(
		document.getElementById("cancel-invite") as HTMLButtonElement
	).addEventListener("click", () => {
		(
			document.getElementById("invite-modal") as HTMLDivElement
		).classList.add("hidden");
	});

	await loadOrgs();
});
