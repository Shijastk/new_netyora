const os = require('os');
const logger = require('./logger');

// Get system information
const getSystemInfo = () => {
  try {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      type: os.type(),
      release: os.release(),
      uptime: os.uptime(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpus: os.cpus().map(cpu => ({
        model: cpu.model,
        speed: cpu.speed,
        times: cpu.times
      })),
      networkInterfaces: Object.entries(os.networkInterfaces()).reduce((acc, [name, interfaces]) => {
        acc[name] = interfaces.map(iface => ({
          address: iface.address,
          netmask: iface.netmask,
          family: iface.family,
          mac: iface.mac,
          internal: iface.internal
        }));
        return acc;
      }, {}),
      loadAvg: os.loadavg(),
      nodeVersion: process.version,
      env: process.env.NODE_ENV
    };
  } catch (error) {
    logger.error('Error getting system info:', error);
    return {
      error: 'Failed to get system info',
      message: error.message
    };
  }
};

// Get memory usage
const getMemoryUsage = () => {
  try {
    const used = process.memoryUsage();
    return {
      rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(used.external / 1024 / 1024)}MB`
    };
  } catch (error) {
    logger.error('Error getting memory usage:', error);
    return {
      error: 'Failed to get memory usage',
      message: error.message
    };
  }
};

// Get process uptime
const getProcessUptime = () => {
  try {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    return {
      total: uptime,
      formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`
    };
  } catch (error) {
    logger.error('Error getting process uptime:', error);
    return {
      error: 'Failed to get process uptime',
      message: error.message
    };
  }
};

// Get request information
const getRequestInfo = (req) => {
  const ip = req.ip || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress || 
             req.connection.socket?.remoteAddress;

  return {
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    body: req.body,
    headers: {
      'user-agent': req.headers['user-agent'],
      'referer': req.headers.referer,
      'origin': req.headers.origin,
      'host': req.headers.host,
      'accept-language': req.headers['accept-language'],
      'accept-encoding': req.headers['accept-encoding']
    },
    ip: ip,
    systemInfo: {
      platform: req.headers['sec-ch-ua-platform'],
      browser: req.headers['sec-ch-ua'],
      mobile: req.headers['sec-ch-ua-mobile']
    },
    cookies: req.cookies,
    session: req.session ? {
      id: req.session.id,
      createdAt: req.session.createdAt
    } : null
  };
};

// Log request details middleware
const logRequestDetails = (req, res, next) => {
  const requestInfo = getRequestInfo(req);
  const systemInfo = getSystemInfo();
  
  logger.info('Request Details:', {
    request: requestInfo,
    system: systemInfo
  });

  // Add to response headers for debugging
  res.setHeader('X-Request-ID', requestInfo.requestId);
  res.setHeader('X-Server-Info', JSON.stringify({
    hostname: systemInfo.hostname,
    uptime: systemInfo.uptime
  }));

  next();
};

module.exports = {
  getSystemInfo,
  getRequestInfo,
  logRequestDetails,
  getMemoryUsage,
  getProcessUptime
}; 