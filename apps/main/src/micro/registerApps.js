import { registerMicroApps, start, initGlobalState } from 'qiankun';
export const MICRO_APP_PORTS = {
    dashboard: 5174,
    kanban: 5175,
    calendar: 5176,
    mail: 5177,
    notes: 5178,
    stock: 5179,
    accounting: 5180,
    sports: 5181,
    logs: 5182,
    settings: 5183,
};
const apps = Object.entries(MICRO_APP_PORTS).map(([name, port]) => ({
    name,
    entry: `//localhost:${port}`,
    container: '#micro-app-container',
    activeRule: `/app-${name}`,
}));
export const registerApps = () => {
    // 初始化全局状态
    const actions = initGlobalState({
        theme: 'system',
        activeNav: 'dashboard',
    });
    // 注册微应用
    registerMicroApps(apps, {
        beforeLoad: [
            (app) => {
                console.log('[主应用] before load', app.name);
                return Promise.resolve();
            },
        ],
        afterMount: [
            (app) => {
                console.log('[主应用] after mount', app.name);
                return Promise.resolve();
            },
        ],
    });
    // 启动 qiankun
    start({
        prefetch: 'all',
        sandbox: { experimentalStyleIsolation: true },
    });
    return actions;
};
//# sourceMappingURL=registerApps.js.map