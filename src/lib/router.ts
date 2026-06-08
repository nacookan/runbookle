import { useCallback, useEffect, useState } from 'react';

export type AppRoute =
  | {
      name: 'list';
    }
  | {
      name: 'new';
    }
  | {
      name: 'edit';
      id: string;
    };

export function useAppRouter() {
  const [route, setRoute] = useState<AppRoute>(() => parseCurrentRoute());

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseCurrentRoute());
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, '', createRouteUrl(to));
    setRoute(parseCurrentRoute());
  }, []);

  return {
    navigate,
    route,
  };
}

function parseCurrentRoute(): AppRoute {
  const path = getAppPath();

  if (path === '/new') {
    return {
      name: 'new',
    };
  }

  const editMatch = path.match(/^\/runbooks\/([^/]+)$/);

  if (editMatch?.[1]) {
    return {
      name: 'edit',
      id: decodeURIComponent(editMatch[1]),
    };
  }

  return {
    name: 'list',
  };
}

function createRouteUrl(to: string) {
  const normalizedPath = to.startsWith('/') ? to : `/${to}`;

  return `${getBasePath()}${normalizedPath.slice(1)}`;
}

function getAppPath() {
  const basePath = getBasePath();
  const currentPath = window.location.pathname;

  if (!currentPath.startsWith(basePath)) {
    return '/';
  }

  const appPath = currentPath.slice(basePath.length - 1);

  return appPath || '/';
}

function getBasePath() {
  return import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
}
