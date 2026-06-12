import ReactDOM from 'react-dom/client';
import App from './App';

let root: ReactDOM.Root | null = null;

function render(props: any) {
  const { container } = props;
  root = ReactDOM.createRoot(
    container ? container.querySelector('#dashboard-root') : document.getElementById('dashboard-root'),
  );
  root.render(<App />);
}

if (!(window as any).__POWERED_BY_QIANKUN__) {
  render({});
}

export async function bootstrap() {}
export async function mount(props: any) { render(props); }
export async function unmount(_props: any) { root?.unmount(); root = null; }
