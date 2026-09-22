import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, DollarSign, TrendingUp, UserMinus, UserPlus } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { cn, findPlayerClub } from '../lib/utils';
import { Player, Position } from '../types/game';
import { PageHeader } from './ui/PageHeader';
import { ScreenTabs } from './ui/ScreenTabs';
import { TeamFlag } from './ui/TeamFlag';

const PAGE_SIZE = 10;

const POSITION_OPTIONS: Array<{ value: 'ALL' | Position; label: string }> = [
  { value: 'ALL', label: 'Todas as posicoes' },
  { value: 'GK', label: 'Goleiros' },
  { value: 'DEF', label: 'Defensores' },
  { value: 'MID', label: 'Meio-campistas' },
  { value: 'ATK', label: 'Atacantes' },
];

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

const getPositionBadgeClass = (position: Position) => {
  switch (position) {
    case 'GK':
      return 'bg-yellow-500/20 text-yellow-500';
    case 'DEF':
      return 'bg-blue-500/20 text-blue-400';
    case 'MID':
      return 'bg-emerald-500/20 text-emerald-400';
    case 'ATK':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-slate-500/20 text-slate-400';
  }
};

function MarketPagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems === 0) return null;

  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalItems);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-400">
        Mostrando <span className="font-bold text-slate-200">{start}-{end}</span> de{' '}
        <span className="font-bold text-slate-200">{totalItems}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors',
            page <= 1
              ? 'cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-600'
              : 'border-slate-600 bg-slate-900 text-slate-200 hover:border-emerald-500 hover:text-emerald-400',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <span className="min-w-[5rem] text-center text-sm font-bold text-slate-300">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors',
            page >= totalPages
              ? 'cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-600'
              : 'border-slate-600 bg-slate-900 text-slate-200 hover:border-emerald-500 hover:text-emerald-400',
          )}
        >
          Proxima
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Market() {
  const teams = useGameStore(state => state.teams);
  const userTeamId = useGameStore(state => state.userTeamId);
  const marketPlayers = useGameStore(state => state.marketPlayers);
  const buyPlayer = useGameStore(state => state.buyPlayer);
  const sellPlayer = useGameStore(state => state.sellPlayer);
  const currentYear = useGameStore(state => state.currentYear ?? 2026);
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState<'ALL' | Position>('ALL');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [clubFilter, setClubFilter] = useState('ALL');
  const [maxPriceFilter, setMaxPriceFilter] = useState('ALL');
  const [minOverallFilter, setMinOverallFilter] = useState('ALL');
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [buyPage, setBuyPage] = useState(1);
  const [sellPage, setSellPage] = useState(1);
  const [sellSearchTerm, setSellSearchTerm] = useState('');
  const [sellPositionFilter, setSellPositionFilter] = useState<'ALL' | Position>('ALL');

  const userTeam = teams.find(team => team.id === userTeamId);

  const marketEntries = useMemo(() => {
    return marketPlayers.map(player => {
      const club = findPlayerClub(teams, player.id);
      const askingPrice = getAskingPrice(
        player.value,
        player.age,
        player.form,
        Math.max(0, (player.contract?.endYear ?? currentYear) - currentYear),
        player.contract?.requestedTransfer ?? false,
      );
      return { player, club, askingPrice };
    });
  }, [currentYear, marketPlayers, teams]);

  const countries = useMemo(
    () =>
      [...new Set(marketEntries.map(entry => entry.club?.country).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [marketEntries],
  );

  const clubs = useMemo(() => {
    return marketEntries
      .map(entry => entry.club)
      .filter((club): club is NonNullable<typeof club> => Boolean(club))
      .filter((club, index, list) => list.findIndex(item => item.id === club.id) === index)
      .filter(club => (countryFilter === 'ALL' ? true : club.country === countryFilter))
      .sort((clubA, clubB) => clubA.name.localeCompare(clubB.name, 'pt-BR'));
  }, [countryFilter, marketEntries]);

  const filteredBuyEntries = useMemo(() => {
    if (!userTeam) return [];

    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('pt-BR');

    return marketEntries
      .filter(({ player, club, askingPrice }) => {
        if (normalizedSearch.length > 0) {
          const matchesName = player.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
          const matchesClub = club?.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch) ?? false;
          if (!matchesName && !matchesClub) return false;
        }

        if (positionFilter !== 'ALL' && player.position !== positionFilter) return false;
        if (countryFilter !== 'ALL' && club?.country !== countryFilter) return false;
        if (clubFilter !== 'ALL' && club?.id !== clubFilter) return false;
        if (minOverallFilter !== 'ALL' && player.overall < Number(minOverallFilter)) return false;
        if (maxPriceFilter !== 'ALL' && askingPrice > Number(maxPriceFilter)) return false;
        if (affordableOnly && askingPrice > userTeam.finances) return false;
        return true;
      })
      .sort((entryA, entryB) => entryB.player.overall - entryA.player.overall);
  }, [
    affordableOnly,
    clubFilter,
    countryFilter,
    marketEntries,
    maxPriceFilter,
    minOverallFilter,
    positionFilter,
    searchTerm,
    userTeam,
  ]);

  const filteredSellPlayers = useMemo(() => {
    if (!userTeam) return [];

    const normalizedSearch = sellSearchTerm.trim().toLocaleLowerCase('pt-BR');

    return [...userTeam.players]
      .filter(player => {
        if (normalizedSearch.length > 0 && !player.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch)) {
          return false;
        }
        if (sellPositionFilter !== 'ALL' && player.position !== sellPositionFilter) return false;
        return true;
      })
      .sort((playerA, playerB) => playerB.overall - playerA.overall);
  }, [sellPositionFilter, sellSearchTerm, userTeam]);

  const buyTotalPages = Math.max(1, Math.ceil(filteredBuyEntries.length / PAGE_SIZE));
  const sellTotalPages = Math.max(1, Math.ceil(filteredSellPlayers.length / PAGE_SIZE));

  const paginatedBuyEntries = filteredBuyEntries.slice((buyPage - 1) * PAGE_SIZE, buyPage * PAGE_SIZE);
  const paginatedSellPlayers = filteredSellPlayers.slice((sellPage - 1) * PAGE_SIZE, sellPage * PAGE_SIZE);

  useEffect(() => {
    setBuyPage(1);
  }, [searchTerm, positionFilter, countryFilter, clubFilter, maxPriceFilter, minOverallFilter, affordableOnly]);

  useEffect(() => {
    setSellPage(1);
  }, [sellSearchTerm, sellPositionFilter]);

  useEffect(() => {
    if (buyPage > buyTotalPages) setBuyPage(buyTotalPages);
  }, [buyPage, buyTotalPages]);

  useEffect(() => {
    if (sellPage > sellTotalPages) setSellPage(sellTotalPages);
  }, [sellPage, sellTotalPages]);

  useEffect(() => {
    if (clubFilter !== 'ALL' && !clubs.some(club => club.id === clubFilter)) {
      setClubFilter('ALL');
    }
  }, [clubFilter, clubs]);

  if (!userTeam) return null;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

  const renderPlayerMeta = (player: Player, clubName?: React.ReactNode) => (
    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
      <span className={cn('rounded px-2 py-0.5 text-[10px] font-bold', getPositionBadgeClass(player.position))}>
        {player.position}
      </span>
      {clubName}
      <span className="text-slate-400">Idade: {player.age}</span>
      <span className="text-slate-400">
        Forca: <span className="font-bold text-emerald-400">{player.overall}</span>
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mercado de Transferencias"
        subtitle="Compra e venda com filtros e paginacao para facilitar a leitura."
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
          { id: 'buy', label: 'Comprar', icon: <UserPlus className="h-4 w-4" />, badge: filteredBuyEntries.length },
          { id: 'sell', label: 'Vender', icon: <UserMinus className="h-4 w-4" />, badge: filteredSellPlayers.length },
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
            <>
              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-700 bg-slate-800/90 p-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Buscar</span>
                  <input
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    placeholder="Jogador ou clube"
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Posicao</span>
                  <select
                    value={positionFilter}
                    onChange={event => setPositionFilter(event.target.value as 'ALL' | Position)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
                  >
                    {POSITION_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Pais</span>
                  <select
                    value={countryFilter}
                    onChange={event => {
                      setCountryFilter(event.target.value);
                      setClubFilter('ALL');
                    }}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
                  >
                    <option value="ALL">Todos os paises</option>
                    {countries.map(country => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Clube</span>
                  <select
                    value={clubFilter}
                    onChange={event => setClubFilter(event.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
                  >
                    <option value="ALL">Todos os clubes</option>
                    {clubs.map(club => (
                      <option key={club.id} value={club.id}>
                        {club.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Overall minimo</span>
                  <select
                    value={minOverallFilter}
                    onChange={event => setMinOverallFilter(event.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
                  >
                    <option value="ALL">Qualquer</option>
                    <option value="60">60+</option>
                    <option value="70">70+</option>
                    <option value="75">75+</option>
                    <option value="80">80+</option>
                    <option value="85">85+</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Preco maximo</span>
                  <select
                    value={maxPriceFilter}
                    onChange={event => setMaxPriceFilter(event.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
                  >
                    <option value="ALL">Qualquer</option>
                    <option value="1000000">Ate R$ 1 mi</option>
                    <option value="5000000">Ate R$ 5 mi</option>
                    <option value="10000000">Ate R$ 10 mi</option>
                    <option value="25000000">Ate R$ 25 mi</option>
                    <option value="50000000">Ate R$ 50 mi</option>
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={affordableOnly}
                  onChange={event => setAffordableOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                Somente jogadores que cabem no caixa
              </label>

              {filteredBuyEntries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/40 p-8 text-center text-sm text-slate-400">
                  Nenhum jogador encontrado com esses filtros.
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {paginatedBuyEntries.map(({ player, club, askingPrice }) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-800 p-4"
                      >
                        <div>
                          <p className="font-bold text-slate-200">{player.name}</p>
                          {renderPlayerMeta(
                            player,
                            <span className="inline-flex items-center gap-1.5 text-slate-300">
                              {club ? (
                                <>
                                  <TeamFlag country={club.country} teamName={club.name} size="xs" />
                                  <span>{club.name}</span>
                                </>
                              ) : (
                                <span className="text-slate-500">Sem clube</span>
                              )}
                            </span>,
                          )}
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
                    ))}
                  </div>

                  <MarketPagination
                    page={buyPage}
                    totalPages={buyTotalPages}
                    totalItems={filteredBuyEntries.length}
                    onPageChange={setBuyPage}
                  />
                </>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'sell' && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-200">
            <DollarSign className="h-5 w-5 text-emerald-400" /> Seu Elenco
          </h2>

          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-700 bg-slate-800/90 p-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Buscar</span>
              <input
                value={sellSearchTerm}
                onChange={event => setSellSearchTerm(event.target.value)}
                placeholder="Nome do jogador"
                className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Posicao</span>
              <select
                value={sellPositionFilter}
                onChange={event => setSellPositionFilter(event.target.value as 'ALL' | Position)}
                className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
              >
                {POSITION_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filteredSellPlayers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/40 p-8 text-center text-sm text-slate-400">
              Nenhum jogador encontrado com esses filtros.
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paginatedSellPlayers.map(player => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-800 p-4"
                  >
                    <div>
                      <p className="font-bold text-slate-200">{player.name}</p>
                      {renderPlayerMeta(player)}
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

              <MarketPagination
                page={sellPage}
                totalPages={sellTotalPages}
                totalItems={filteredSellPlayers.length}
                onPageChange={setSellPage}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
