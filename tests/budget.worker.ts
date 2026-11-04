// Disposable deployment: exercises the production DO without any TURN secrets.
export { TurnBudget } from '../server/worker';
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const run = url.searchParams.get('run') || '';
    const room = url.searchParams.get('room') || '';
    if (!/^[a-f0-9-]{36}$/.test(run)) return new Response(null, {status:400});
    const allowed = await env.TURN_BUDGET.getByName(run).reserve(room);
    return Response.json({allowed});
  },
};
