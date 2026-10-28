import { createGalleryOpsReader } from '../src/gallery-ops-reader.mjs';
const host = process.env.GALLERY_OPS_READER_HOST || '127.0.0.1';
if (!['127.0.0.1', '::1'].includes(host)) throw Error('GALLERY_OPS_READER_MUST_BIND_LOOPBACK');
const port = Number(process.env.GALLERY_OPS_READER_PORT || 4196);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('GALLERY_OPS_READER_PORT_INVALID');
const app = createGalleryOpsReader({ secret: process.env.GALLERY_OPS_READER_SECRET });
app.listen(port, host, () => {
  console.info(JSON.stringify({ event: 'gallery_ops_reader_started', port }));
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close(() => process.exit(0)));
