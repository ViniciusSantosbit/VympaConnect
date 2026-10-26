import { ArrowUpRight, Blocks, Code2, Database, ShieldCheck, Terminal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
export function FoundationPage() {
  return (
    <div className="foundation-page">
      <div className="eyebrow">
        <span /> PLATAFORMA ADMINISTRATIVA INTERNA
      </div>
      <div className="page-heading">
        <div>
          <h1>
            Uma base sólida.
            <br />
            <span>O próximo capítulo começa aqui.</span>
          </h1>
          <p>
            A estrutura do VYMPA Connect está preparada para evoluir. <br />
            Cada domínio no seu lugar. Cada próxima etapa com clareza.
          </p>
        </div>
        <span className="stage-badge">
          ETAPA <strong>01</strong>
        </span>
      </div>
      <section className="hero-panel" aria-label="Estado da fundação">
        <div className="hero-grid" />
        <div className="hero-content">
          <span className="hero-icon">
            <Blocks size={28} />
          </span>
          <span className="pill">FUNDAÇÃO TÉCNICA</span>
          <h2>Fundação pronta para evoluir.</h2>
          <p>
            Monólito modular, contratos compartilhados e ambientes separados. <br />
            As funcionalidades de negócio serão construídas nas próximas etapas.
          </p>
          <div className="hero-tags">
            <span>React + TypeScript</span>
            <span>NestJS + Prisma</span>
            <span>PostgreSQL</span>
          </div>
        </div>
        <div className="hero-symbol" aria-hidden="true">
          <Blocks strokeWidth={0.7} />
        </div>
      </section>
      <div className="section-heading">
        <h2>Arquitetura em foco</h2>
        <span>ESTRUTURA · SEM DADOS COMERCIAIS</span>
      </div>
      <section className="architecture-cards" aria-label="Camadas da arquitetura">
        {[
          {
            icon: Code2,
            title: 'Interface',
            subtitle: 'apps/web',
            text: 'Uma experiência administrativa modular, responsiva e preparada para crescer.',
          },
          {
            icon: Terminal,
            title: 'API',
            subtitle: 'apps/api',
            text: 'REST versionada, validação de entrada e organização por domínio.',
          },
          {
            icon: Database,
            title: 'Persistência',
            subtitle: 'PostgreSQL + Prisma',
            text: 'Schema técnico e migrations versionadas para a evolução do banco.',
          },
        ].map(({ icon: Icon, title, subtitle, text }) => (
          <Card key={title}>
            <CardHeader>
              <div className="card-icon">
                <Icon size={20} />
              </div>
              <ArrowUpRight className="card-arrow" size={17} />
              <CardTitle>{title}</CardTitle>
              <code>{subtitle}</code>
            </CardHeader>
            <CardContent>
              <p>{text}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="next-step">
        <div className="next-icon">
          <ShieldCheck size={23} />
        </div>
        <div>
          <h2>O próximo passo é segurança.</h2>
          <p>Autenticação administrativa, MFA e permissões antes de qualquer dado real.</p>
        </div>
        <span>
          PRÓXIMA ETAPA <ArrowUpRight size={16} />
        </span>
      </section>
      <p className="foundation-note">
        Estrutura de desenvolvimento. Integrações externas e módulos comerciais ainda não
        implementados.
      </p>
    </div>
  );
}
