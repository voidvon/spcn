import { requireAuth } from '../../middleware/auth.mjs';
import { CONTENT_ROOT } from '../../config.mjs';
import {
  buildStaticSite,
  buildIndexPage,
  buildContactPage,
  buildMessagePage,
  buildCorporationPages,
  buildNewsCategoryPages,
  buildNewsDetailPages,
  buildProductCategoryPages,
  buildProductDetailPages,
  buildServiceCategoryPages,
  buildServiceDetailPages,
  buildJobIndexPages,
  buildJobDetailPages
} from '../../static-builder.mjs';

export default async function staticGenRoutes(app) {
  // 兼容旧入口，转到 React 后台页
  app.get('/build', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    return reply.redirect('/admin/static-gen');
  });

  // 静态生成接口
  app.post('/build/generate', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const section = request.query.section || 'all';

    try {
      let result;

      switch (section) {
        case 'index':
          result = buildIndexPage({ outputRoot: CONTENT_ROOT });
          break;
        case 'contact':
          result = buildContactPage({ outputRoot: CONTENT_ROOT });
          break;
        case 'message':
          result = buildMessagePage({ outputRoot: CONTENT_ROOT });
          break;
        case 'corporation':
          result = buildCorporationPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'product-lists':
          result = buildProductCategoryPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'product-details':
          result = buildProductDetailPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'news-lists':
          result = buildNewsCategoryPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'news-details':
          result = buildNewsDetailPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'service-lists':
          result = buildServiceCategoryPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'service-details':
          result = buildServiceDetailPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'job-lists':
          result = buildJobIndexPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'job-details':
          result = buildJobDetailPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'all':
          result = buildStaticSite({ outputRoot: CONTENT_ROOT });
          break;
        default:
          return reply.badRequest('未知的生成类型');
      }

      return {
        success: true,
        totalFiles: result.totalFiles || result.filesWritten || 0,
        totalRecords: result.totalRecords || result.recordsProcessed || 0,
        result
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message
      });
    }
  });
}
