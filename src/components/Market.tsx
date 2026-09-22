import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { DollarSign, TrendingUp, UserMinus, UserPlus } from 'lucide-react';
import { cn, findPlayerClub } from '../lib/utils';
import { PageHeader } from './ui/PageHeader';
import { ScreenTabs } from './ui/ScreenTabs';
import { TeamFlag } from './ui/TeamFlag';

const getAskingPrice = (
  value: number,
  age: number,
  form = 6,
  yearsLeft = 1,
  requestedTransfer = false,
) => {
  const ageModifier = age <= 23 ? 0.12 : age >= 31 ? -0.12 : 0;
  const formModifier = form >= 7.2 ? 0.1 : form <= 5.8 ? -0.08 : 0;
  const contractModifier = yearsLeft >= 3 ? 0.08 : yearsLeft === 0 ? -0.12 : 0;
  const transferModifier = requestedTransfer ? -0.08 : 0;
  return Math.round(value * Math.max(0.82, Math.min(1.35, 1.02 + ageModifier + formModifier + contractModifier + transferModifier)));
};

export function Market() {
  const teams = useGameStore(state => state.teams);
  const userTeamId = useGameStore(state => state.userTeamId);
  const marketPlayers = useGameStore(state => state.marketPlayers);
  const buyPlayer = useGameStore(state => state.buyPlayer);
  const sellPlayer = useGameStore(state => state.sellPlayer);
  const currentYear = useGameStore(state => state.currentYear ?? 2026);
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const userTeam = teams.find(team => team.id === userTeamId);

  if (!userTeam) return null;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mercado de Transferencias"
        subtitle="Compra e venda separadas em sub-abas para facilitar a leitura no celular."
        icon={<TrendingUp className="h-7 w-7" />}
        aside={
          <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-6 py-3">
            <DollarSign className="h-6 w-6 text-emerald-500" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Saldo em Caixa</p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(userTeam.finances)}</p>
            </div>
          </div>
        }
      />

      <ScreenTabs
        items={[
          { id: 'buy', label: 'Comprar', icon: <UserPlus className="h-4 w-4" />, badge: marketPlayers.length },
          { id: 'sell', label: 'Vender', icon: <UserMinus className="h-4 w-4" />, badge: userTeam.players.length },
        ]}
        activeTab={activeTab}
        onChange={tab => setActiveTab(tab as 'buy' | 'sell')}
      />

      {activeTab === 'buy' && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-200">
            <TrendingUp className="h-5 w-5 text-blue-400" /> Jogadores Disponiveis
          </h2>
          {marketPlayers.length === 0 ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-8 text-center">
              <p className="text-slate-400">O mercado esta fechado no momento. Volte na proxima janela.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {marketPlayers.map(player => {
                const club = findPlayerClub(teams, player.id);
                const askingPrice = getAskingPrice(
                  player.value,
                  player.age,
                  player.form,
                  Math.max(0, (player.contract?.endYear ?? currentYear) - currentYear),
                  player.contract?.requestedTransfer ?? false,
                );

                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-800 p-4"
                  >
                    <div>
                      <p className="font-bold text-slate-200">{player.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-[10px] font-bold',
                            player.position === 'GK'
                              ? 'bg-yellow-500/20 text-yellow-500'
                              : player.position === 'DEF'
                                ? 'bg-blue-500/20 text-blue-400'
                                : player.position === 'MID'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-red-500/20 text-red-400',
                          )}
                        >
                          {player.position}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          {club ? (
                            <>
                              <TeamFlag country={club.country} teamName={club.name} size="xs" />
                              <span>{club.name}</span>
                            </>
                          ) : (
                            <span className="text-slate-500">Sem clube</span>
                          )}
                        </span>
                        <span className="text-slate-400">Idade: {player.age}</span>
                        <span className="text-slate-400">
                          Forca: <span className="font-bold text-emerald-400">{player.overall}</span>
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-400">
                          Contrato ate {player.contract?.endYear ?? currentYear}
                        </span>
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-400">
                          Salario {formatCurrency(player.salary)}/mes
                        </span>
                        {player.contract?.requestedTransfer && (
                          <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-bold text-rose-400">
                            Disponivel para negociar
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="font-bold text-slate-300">{formatCurrency(askingPrice)}</span>
                      <button
                        onClick={() => buyPlayer(player.id)}
                        disabled={userTeam.finances < askingPrice}
                        className={cn(
                          'flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors',
                          userTeam.finances >= askingPrice
                            ? 'border-emerald-500/30 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                            : 'cursor-not-allowed border-slate-600 bg-slate-700 text-slate-500',
                        )}
                      >
                        <UserPlus className="h-4 w-4" /> Comprar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'sell' && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-200">
            <DollarSign className="h-5 w-5 text-emerald-400" /> Seu Elenco
          </h2>
          <div className="space-y-3">
            {userTeam.players.map(player => (
              <div
                key={player.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-800 p-4"
              >
                <div>
                  <p className="font-bold text-slate-200">{player.name}</p>
                  <div className="mt-1 flex items-center gap-3 text-sm">
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-[10px] font-bold',
                        player.position === 'GK'
                          ? 'bg-yellow-500/20 text-yellow-500'
                          : player.position === 'DEF'
                            ? 'bg-blue-500/20 text-blue-400'
                            : player.position === 'MID'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-red-500/20 text-red-400',
                      )}
                    >
                      {player.position}
                    </span>
                    <span className="text-slate-400">Idade: {player.age}</span>
                    <span className="text-slate-400">
                      Forca: <span className="font-bold text-emerald-400">{player.overall}</span>
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-400">
                      Contrato ate {player.contract?.endYear ?? currentYear}
                    </span>
                    {player.contract?.requestedSalaryIncrease && (
                      <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-bold text-sky-400">
                        Pede aumento
                      </span>
                    )}
                    {player.contract?.requestedTransfer && (
                      <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-bold text-rose-400">
                        Quer sair
                      </span>
                    )}
                    {player.injury && player.injury.weeksRemaining > 0 && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-400">
                        Lesionado
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-bold text-slate-300">{formatCurrency(player.value)}</span>
                  <button
                    onClick={() => sellPlayer(player.id)}
                    className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-sm font-bold text-red-400 transition-colors hover:bg-red-500/30"
                  >
                    <UserMinus className="h-4 w-4" /> Vender
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
