import React from 'react';
import LazyProviders from '../LazyProviders';
import { Layout } from './layout/Layout';

/** Shell autenticado (providers + layout) — carregado só após login para reduzir o bundle inicial. */
export const AuthenticatedShell: React.FC = () => (
  <LazyProviders>
    <Layout />
  </LazyProviders>
);
