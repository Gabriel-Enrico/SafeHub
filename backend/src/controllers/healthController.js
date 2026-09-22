export async function getHealthStatus(request, reply) {
  return {
    status: 'OK',
    timestamp: new Date().toISOString(),
  };
}
