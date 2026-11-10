// Projects workspace API (projects-plan.md). Shared by admins (Projects
// module) and technicians (project managers / team); per-project rules live
// in services/projectWorkspaceService.js.
import express from 'express';
import { verifyTokenFn, requirePermission, requireTechnician } from '../middleware/auth.js';
import { validateProjectId } from '../middleware/validation.js';
import * as workspace from '../services/projectWorkspaceService.js';
import { acquireUploadSlot, MAX_FILE_BYTES, MAX_THUMBNAIL_BYTES } from '../services/projectFileStore.js';

const router = express.Router();

// Admin -> needs the 'projects' module; technician -> live session check.
// Every other role is refused.
const requireProjectActor = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Missing authorization header' });
  }
  let role;
  try {
    ({ role } = verifyTokenFn(header.substring(7)));
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Unauthorized', message: error.message });
  }
  if (role === 'admin') return requirePermission('projects')(req, res, next);
  if (role === 'technician') return requireTechnician(req, res, next);
  return res.status(403).json({ success: false, error: 'Forbidden', message: 'Projects are for admins and technicians' });
};

const loadActor = async (req, res, next) => {
  try {
    req.actor = await workspace.loadActor(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

router.use(requireProjectActor, loadActor);

const send = (res, error) => {
  if (error.status) return res.status(error.status).json({ success: false, error: error.message, code: error.code });
  console.error('Project workspace error:', error);
  return res.status(500).json({ success: false, error: 'Something went wrong — please try again' });
};

const handle = (fn, status = 200) => async (req, res) => {
  try {
    res.status(status).json({ success: true, data: await fn(req) });
  } catch (error) {
    send(res, error);
  }
};

// GET /api/project-workspace — the technician's own projects. An admin may
// pass ?technician_id= (the "view as technician" switch).
router.get('/', handle((req) => {
  if (req.actor.role === 'technician') return workspace.listProjectsForTechnician(req.actor.id);
  const technicianId = String(req.query.technician_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(technicianId)) {
    throw Object.assign(new Error('technician_id is required'), { status: 400 });
  }
  return workspace.listProjectsForTechnician(technicianId);
}));

router.get('/:id', validateProjectId, handle((req) => workspace.getWorkspace(req.params.id, req.actor)));

router.post('/:id/activities', validateProjectId,
  handle((req) => workspace.assignActivities(req.params.id, req.body || {}, req.actor), 201));

router.patch('/:id/activities/:activityId/reassign', validateProjectId,
  handle((req) => workspace.reassignActivity(req.params.id, req.params.activityId, req.body?.technician_id, req.actor)));

router.patch('/:id/activities/:activityId/cancel', validateProjectId,
  handle((req) => workspace.cancelActivity(req.params.id, req.params.activityId, req.actor)));

// Upload: checked for permission, then queued for an upload slot, and only
// then is the body read (application/octet-stream; metadata in the query).
const canManageEarly = async (req, res, next) => {
  try {
    const access = await workspace.resolveAccess(req.params.id, req.actor);
    if (!access.canManage) return res.status(403).json({ success: false, error: 'Only this project\'s managers or an admin can upload files' });
    next();
  } catch (error) {
    send(res, error);
  }
};

const uploadSlot = async (req, res, next) => {
  try {
    const release = await acquireUploadSlot();
    res.on('close', release);
    next();
  } catch (error) {
    res.status(503).json({ success: false, error: error.message });
  }
};

router.post('/:id/files', validateProjectId, canManageEarly, uploadSlot,
  express.raw({ type: 'application/octet-stream', limit: MAX_FILE_BYTES + MAX_THUMBNAIL_BYTES }),
  handle((req) => {
    if (!Buffer.isBuffer(req.body)) throw Object.assign(new Error('Send the file as application/octet-stream'), { status: 400 });
    return workspace.uploadFile(req.params.id, req.query, req.body, req.actor);
  }, 201));

// Files never change once stored (a new version is a new upload), so the
// browser may cache them for good — re-opening a file costs no server work.
router.get('/:id/files/:fileId', validateProjectId, async (req, res) => {
  try {
    const thumbnail = req.query.thumb === '1';
    const file = await workspace.getFileContent(req.params.id, req.params.fileId, req.actor, { thumbnail });
    res.set({
      'Content-Type': file.mime,
      'Content-Length': String(file.buffer.length),
      'Content-Disposition': `${req.query.download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(file.buffer);
  } catch (error) {
    send(res, error);
  }
});

router.delete('/:id/files/:fileId', validateProjectId,
  handle((req) => workspace.deleteFile(req.params.id, req.params.fileId, req.actor)));

router.post('/:id/submit', validateProjectId,
  handle((req) => workspace.submitForApproval(req.params.id, req.body || {}, req.actor)));

router.post('/:id/review', validateProjectId,
  handle((req) => workspace.reviewCompletion(req.params.id, req.body || {}, req.actor)));

// express.raw's own errors (oversized body, aborted upload).
// eslint-disable-next-line no-unused-vars
router.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: `Files must be ${MAX_FILE_BYTES / (1024 * 1024)} MB or smaller` });
  }
  if (error.type === 'request.aborted') return res.status(400).json({ success: false, error: 'Upload was interrupted' });
  return send(res, error);
});

export default router;
