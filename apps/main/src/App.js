import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import MainLayout from '@/layouts/MainLayout';
import { registerApps } from '@/micro/registerApps';
const App = () => {
    const [activeRoute, setActiveRoute] = useState('dashboard');
    useEffect(() => {
        registerApps();
    }, []);
    const handleNavigate = (route) => {
        setActiveRoute(route);
        // 触发微应用路由切换
        window.history.pushState(null, '', `/app-${route}`);
    };
    return (_jsx(ThemeProvider, { children: _jsx(MainLayout, { activeRoute: activeRoute, onNavigate: handleNavigate }) }));
};
export default App;
//# sourceMappingURL=App.js.map