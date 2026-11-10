// Writes a repo's records (tickets, comments, labels, files) on its knot, as Tangled's
// website does (web/src/lib/api/cob.ts). The knot checks who is writing from a token
// addressed to the repo's DID; each create and edit is then attested from the user's
// own account, so the knot can't put words in anyone's mouth.
import { API } from './api.js';
import { xrpcQuery } from './atproto.js';
import { t } from './i18n.js';
import { authorOf, buildAttestationRecord, buildCommentRecord, knotOf, NSID, ticketUri } from './tangled.js';

const EDITOR_FIELD = 'x-tngl-editor';

export async function knotCall(session, repoDid, nsid, input) {
  return session.callService(await knotOf(repoDid), nsid, { repo: repoDid, ...input }, { aud: repoDid });
}

// The write already landed, so a failed attestation is a warning: the website shows the
// record with a notice that its author hasn't confirmed it.
async function attest(session, saved) {
  try {
    await session.createRecord(NSID.attestation, buildAttestationRecord(saved));
  } catch (err) {
    console.error(t(
      `Warning: saved, but your account could not sign it (${err.message}).`,
      `Aviso: guardado, pero tu cuenta no ha podido firmarlo (${err.message}).`,
    ));
  }
}

export async function readFromKnot(uri) {
  const [repo, collection, rkey] = uri.replace('at://', '').split('/');
  const data = await xrpcQuery(await knotOf(repo), 'com.atproto.repo.getRecord', { repo, collection, rkey });
  return { uri: data.uri, cid: data.cid, value: data.value };
}

export async function createOnKnot(session, repoDid, collection, record, rkey) {
  const saved = await knotCall(session, repoDid, 'com.atproto.repo.createRecord', { collection, record, ...(rkey ? { rkey } : {}) });
  await attest(session, saved);
  return saved;
}

// Replaces a record with `mutate(latest value)`, only if it is still the version read.
export async function editOnKnot(session, uri, mutate) {
  const current = await readFromKnot(uri);
  const { [EDITOR_FIELD]: _editor, ...stored } = current.value;
  const [repo, collection, rkey] = uri.replace('at://', '').split('/');
  const record = mutate(stored);
  const saved = await knotCall(session, repo, 'com.atproto.repo.putRecord', { collection, rkey, swapRecord: current.cid, record });
  await attest(session, saved);
  return record;
}

export async function deleteOnKnot(session, uri) {
  const current = await readFromKnot(uri);
  const [repo, collection, rkey] = uri.replace('at://', '').split('/');
  await knotCall(session, repo, 'com.atproto.repo.deleteRecord', { collection, rkey, swapRecord: current.cid });
}

export function setTicketState(session, uri, state) {
  return editOnKnot(session, uri, (value) => ({ ...value, state }));
}

// A comment has to name the current version of what it is about, or the knot refuses it.
export async function postComment(session, subjectUri, body) {
  const subject = await readFromKnot(subjectUri);
  return createOnKnot(session, authorOf(subjectUri), NSID.comment, buildCommentRecord({ subject, body }));
}

// Adds a revision to a PR. The knot checks that `head` is on the branch.
export async function submitPatch(session, repoDid, ticket, { base, head }, branch) {
  const patch = { ticket, base: { oid: base }, head: { oid: head }, sourceRepo: repoDid, sourceBranch: branch };
  const saved = await knotCall(session, repoDid, 'org.tangled.review.submitPatch', { patch });
  await attest(session, saved);
  return saved;
}

// A PR is a ticket plus its first revision. If the knot refuses the revision, the ticket
// is erased again so no PR is left without changes.
export async function openPull(session, repoDid, record, range, branch) {
  const ticket = await createOnKnot(session, repoDid, NSID.ticket, record);
  const rkey = ticket.uri.split('/').pop();
  try {
    await submitPatch(session, repoDid, rkey, range, branch);
  } catch (err) {
    await deleteOnKnot(session, ticketUri(repoDid, rkey)).catch(() => {});
    throw err;
  }
  return ticket;
}

export async function uploadToKnot(session, repoDid, bytes, mimeType) {
  const { blob } = await session.callService(await knotOf(repoDid), 'com.atproto.repo.uploadBlob', bytes, { aud: repoDid, contentType: mimeType });
  return blob;
}

// Merges on the server. It goes through Tangled's API, which passes the token on to the
// knot, so the token is for the knot's push method.
export async function mergeCommit(session, repoDid, { branch, target, head, style }) {
  const nsid = 'sh.tangled.git.mergeCommit';
  const input = {
    target: { $type: `${nsid}#target`, repo: repoDid, branch, commit: target },
    source: { $type: `${nsid}#source`, repo: repoDid, commit: head },
    style,
  };
  const aud = `did:web:${new URL(await knotOf(repoDid)).host}`;
  return session.callService(API, nsid, input, { aud, lxm: 'org.tangled.git.receivePack' });
}
