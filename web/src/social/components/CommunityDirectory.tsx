"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createCommunity } from "@social/lib/actions";
import { isValidName, metadataURI, NAME_RULES } from "@social/lib/community";
import { CONTRACTS } from "@social/lib/contracts";
import { fetchCommunities, fetchCommunity, type CommunitySummary } from "@social/lib/indexer";
import { useViewer } from "@social/lib/viewer";
import { explainError, isUserCancelled } from "@/lib/wallet/errors";
import { CommunityHeader } from "./CommunityHeader";
import { Masthead } from "./Masthead";
import { Sidebar } from "./Sidebar";
import { SignInButton } from "./SignInButton";

/** The two halves of the same page: the ones you are in, and the ones you
    could be. Discovery is the landing tab because a new account's list is
    empty by definition. */
type Tab = "mine" | "explore";

export function CommunityDirectory() {
  const viewer = useViewer();
  const [tab, setTab] = useState<Tab>("explore");
  const [rows, setRows] = useState<CommunitySummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [createdReady, setCreatedReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      void fetchCommunities(viewer ?? undefined, query).then(list => {
        if (active) { setRows(list); setMore(list.length === 100); setLoading(false); }
      }, e => { if (active) { setError(e.message); setLoading(false); } });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [viewer, query, revision]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!viewer || busy || !isValidName(name)) return;
    setBusy(true); setCreateError(null); setCreated(null); setCreatedReady(false);
    try {
      await createCommunity(name, metadataURI(description, icon));
      setCreated(name);
      // Wait briefly for the new page to become discoverable after confirmation.
      for (let i = 0; i < 20; i++) {
        if (await fetchCommunity(name)) { setCreatedReady(true); break; }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      setName(""); setDescription(""); setIcon(""); refresh();
    } catch (e) {
      if (!isUserCancelled(e)) setCreateError(explainError(e));
    } finally { setBusy(false); }
  }

  // The two tabs split the same list rather than repeat it: a community you
  // are already in is yours, not something left to discover.
  const mine = rows.filter(c => c.joined);
  const explore = rows.filter(c => !c.joined);

  const list = (items: CommunitySummary[]) =>
    items.map(c => <CommunityHeader key={c.name} community={c} viewer={viewer} compact onChanged={refresh} />);

  return <main className="shell">
    <Masthead />
    <div className="layout">
      <Sidebar />
      <div className="layout-main">
    <section className="community-directory-intro">
      <h1>Communities</h1>
      <p>Find your people. Join a community to see its posts on <Link href="/">Home</Link>.</p>
    </section>

    <div className="community-tabs" role="tablist">
      <button
        role="tab"
        aria-selected={tab === "mine"}
        className={tab === "mine" ? "is-on" : ""}
        onClick={() => setTab("mine")}
        data-testid="communities-mine"
      >
        Your communities
      </button>
      <button
        role="tab"
        aria-selected={tab === "explore"}
        className={tab === "explore" ? "is-on" : ""}
        onClick={() => setTab("explore")}
        data-testid="communities-explore"
      >
        Explore
      </button>
    </div>

    {tab === "explore" ? <>
      {viewer && CONTRACTS.communityRegistry ? (
        <div className="community-create">
          {/* One button, where the create form lives. It used to be here as a
              disclosure and again in the rail as a link to this page, which is
              two doors to one room. */}
          <button
            className="btn"
            onClick={() => setCreating((open) => !open)}
            data-testid="create-community"
          >
            {creating ? "Cancel" : "Create a community"}
          </button>
          {creating && (
            <form onSubmit={create}>
              <label>Name<input value={name} onChange={e => setName(e.target.value)} maxLength={21} required pattern="[a-z0-9_]{3,21}" aria-describedby="community-name-rules" /></label>
              <small id="community-name-rules">{NAME_RULES}</small>
              <label>Description<textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} /></label>
              <label>Icon URL (optional)<input value={icon} onChange={e => setIcon(e.target.value)} placeholder="https://… or ipfs://…" pattern="(https?://|ipfs://).*" /></label>
              <button className="btn btn-sm" disabled={busy || !isValidName(name)}>{busy ? "Creating…" : "Create"}</button>
              {createError && <p className="error-note" role="alert">{createError}</p>}
              {created && <p role="status">Created {createdReady
                ? <Link href={`/m/${created}/`}>m/{created}</Link>
                : <>m/{created}. Its page is catching up. <button type="button" className="btn btn-quiet btn-sm"
                    disabled={busy} onClick={() => void fetchCommunity(created).then(c => { if (c) { setCreatedReady(true); refresh(); } }, () => {})}>Check again</button></>}.</p>}
            </form>
          )}
        </div>
      ) : !viewer ? <div className="community-signin"><p>Sign in to create or join a community.</p><SignInButton /></div> : null}

      <div className="community-directory-intro">
        <label className="community-search">Find a community
          <input value={query} onChange={e => setQuery(e.target.value.toLowerCase().replace(/^m\//, ""))} placeholder="Search by name" />
        </label>
      </div>

      {loading ? <p className="state">Loading communities…</p> : error ? <p className="state" role="alert">{error} <button className="btn btn-sm" onClick={refresh}>Try again</button></p>
        : explore.length === 0 ? <p className="state">{query
            ? "No communities match that name."
            : rows.length > 0 ? "You have joined every community." : "No communities yet. Start one."}</p>
        : list(explore)}
      {more && !loading && <button className="btn btn-quiet" onClick={async () => {
        try { const next = await fetchCommunities(viewer ?? undefined, query, rows.length); setRows(r => [...r, ...next]); setMore(next.length === 100); }
        catch (e) { setError(e instanceof Error ? e.message : "Could not load communities."); }
      }}>Load more</button>}
    </> : <>
      {!viewer ? (
        <div className="community-signin"><p>Sign in to keep your communities here.</p><SignInButton /></div>
      ) : loading ? (
        <p className="state">Loading…</p>
      ) : mine.length === 0 ? (
        <p className="state">
          You have not joined any yet.{" "}
          <button className="btn btn-quiet btn-sm" onClick={() => setTab("explore")}>
            Explore communities
          </button>
        </p>
      ) : list(mine)}
    </>}
      </div>
    </div>
  </main>;
}
