import React from 'react';
import { ServicoProvider } from './lib/ServicoStore';
import { FinanceiroProvider } from './lib/FinanceiroStore';
import { ClienteStoreProvider } from './lib/ClienteStore';
import { PlanosProvider } from './lib/PlanosStore';
import { RelatoriosProvider } from './lib/RelatoriosStore';
import { WhatsappCRMProvider } from './lib/WhatsappCRMStore';
import { CaixaProvider } from './lib/CaixaStore';
import { SalasProvider } from './lib/SalasStore';
import { FilialProvider } from './lib/FilialContext';
import { EmpresaContextoAtivoProvider } from './lib/EmpresaContextoAtivo';

const LazyProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <EmpresaContextoAtivoProvider>
    <FilialProvider>
    <ServicoProvider>
      <FinanceiroProvider>
        <CaixaProvider>
          <ClienteStoreProvider>
            <PlanosProvider>
              <RelatoriosProvider>
                <WhatsappCRMProvider>
                  <SalasProvider>{children}</SalasProvider>
                </WhatsappCRMProvider>
              </RelatoriosProvider>
            </PlanosProvider>
          </ClienteStoreProvider>
        </CaixaProvider>
      </FinanceiroProvider>
    </ServicoProvider>
  </FilialProvider>
  </EmpresaContextoAtivoProvider>
);

export default LazyProviders;
