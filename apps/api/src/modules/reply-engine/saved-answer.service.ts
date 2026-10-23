import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, SavedAnswer, SavedAnswerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AnswerMatch,
  DIRECT_MATCH_SCORE,
  HINT_MATCH_SCORE,
  answerInLanguage,
  findBestAnswer,
  scoreQuestion,
  tokenize,
} from '../../common/reply/answer-matcher';
import { isLanguageTag, type LanguageTag } from '../../common/language/language';

export interface SavedAnswerInput {
  questions?: unknown;
  answerEn?: unknown;
  answerSi?: unknown;
  answerSiLatn?: unknown;
  status?: unknown;
}

/** Active answers are cached briefly per tenant; edits on this server clear it at once. */
const CACHE_TTL_MS = 30_000;
/** Suggestions stop growing past this, so a spam wave can't fill the table. */
const MAX_SUGGESTIONS = 200;
/** A new unanswered question this close to an existing suggestion counts as the same one. */
const SAME_SUGGESTION_SCORE = 0.8;

const STATUSES = Object.values(SavedAnswerStatus);

@Injectable()
export class SavedAnswerService {
  private readonly logger = new Logger(SavedAnswerService.name);
  private readonly cache = new Map<string, { at: number; answers: SavedAnswer[] }>();

  constructor(private readonly prisma: PrismaService) {}

  // ── CRUD ────────────────────────────────────────────────────────────────

  list(tenantId: string, status?: string) {
    if (status !== undefined && !(STATUSES as string[]).includes(status)) {
      throw new BadRequestException(`status must be one of ${STATUSES.join(', ')}.`);
    }
    return this.prisma.savedAnswer.findMany({
      where: { tenantId, ...(status ? { status: status as SavedAnswerStatus } : {}) },
      orderBy: status === SavedAnswerStatus.SUGGESTED ? [{ askedCount: 'desc' }, { updatedAt: 'desc' }] : [{ updatedAt: 'desc' }],
      take: 500,
    });
  }

  async create(tenantId: string, userId: string | undefined, input: SavedAnswerInput & { sourceConversationId?: unknown }) {
    const data = this.validate(input, true);
    const row = await this.prisma.savedAnswer.create({
      data: {
        tenantId,
        createdByUserId: userId,
        sourceConversationId: typeof input.sourceConversationId === 'string' ? input.sourceConversationId.slice(0, 64) : undefined,
        questions: data.questions!,
        answerEn: data.answerEn ?? '',
        answerSi: data.answerSi ?? '',
        answerSiLatn: data.answerSiLatn ?? '',
        status: data.status ?? SavedAnswerStatus.ACTIVE,
      },
    });
    this.cache.delete(tenantId);
    return row;
  }

  async update(tenantId: string, id: string, input: SavedAnswerInput) {
    const existing = await this.get(tenantId, id);
    const data = this.validate({ ...existing, ...stripUndefined(input) }, false);
    const row = await this.prisma.savedAnswer.update({
      where: { id: existing.id },
      data: {
        questions: data.questions,
        answerEn: data.answerEn,
        answerSi: data.answerSi,
        answerSiLatn: data.answerSiLatn,
        status: data.status,
        // A suggestion that becomes an answer starts its own use count.
        ...(existing.status === SavedAnswerStatus.SUGGESTED && data.status === SavedAnswerStatus.ACTIVE ? { useCount: 0 } : {}),
      },
    });
    this.cache.delete(tenantId);
    return row;
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.get(tenantId, id);
    await this.prisma.savedAnswer.delete({ where: { id: existing.id } });
    this.cache.delete(tenantId);
    return { success: true };
  }

  private async get(tenantId: string, id: string) {
    const row = await this.prisma.savedAnswer.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Saved answer not found');
    return row;
  }

  private validate(input: SavedAnswerInput, isNew: boolean) {
    const text = (v: unknown, field: string, max: number) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v !== 'string') throw new BadRequestException(`${field} must be text.`);
      const t = v.trim();
      if (t.length > max) throw new BadRequestException(`${field} must be at most ${max} characters.`);
      return t;
    };

    let questions: string[] | undefined;
    if (input.questions !== undefined) {
      if (!Array.isArray(input.questions)) throw new BadRequestException('questions must be a list.');
      const seen = new Set<string>();
      questions = [];
      for (const q of input.questions) {
        const t = text(q, 'Each question', 300);
        if (!t) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        questions.push(t);
      }
      if (questions.length > 20) throw new BadRequestException('Add at most 20 ways of asking.');
    }
    if ((isNew || questions !== undefined) && !questions?.length) {
      throw new BadRequestException('Add at least one way customers ask this question.');
    }
    if (questions && !questions.some((q) => tokenize(q).length > 0)) {
      throw new BadRequestException('The question needs at least one meaningful word (not only "hi" or "please").');
    }

    const answerEn = text(input.answerEn, 'English answer', 2000);
    const answerSi = text(input.answerSi, 'Sinhala answer', 2000);
    const answerSiLatn = text(input.answerSiLatn, 'Singlish answer', 2000);

    let status: SavedAnswerStatus | undefined;
    if (input.status !== undefined) {
      if (typeof input.status !== 'string' || !(STATUSES as string[]).includes(input.status)) {
        throw new BadRequestException(`status must be one of ${STATUSES.join(', ')}.`);
      }
      status = input.status as SavedAnswerStatus;
    }
    const finalStatus = status ?? (isNew ? SavedAnswerStatus.ACTIVE : undefined);
    if (finalStatus === SavedAnswerStatus.ACTIVE && !answerEn && !answerSi && !answerSiLatn) {
      throw new BadRequestException('Write the answer in at least one language.');
    }
    return { questions, answerEn, answerSi, answerSiLatn, status };
  }

  // ── Matching ────────────────────────────────────────────────────────────

  async activeAnswers(tenantId: string): Promise<SavedAnswer[]> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.answers;
    const answers = await this.prisma.savedAnswer.findMany({
      where: { tenantId, status: SavedAnswerStatus.ACTIVE },
      take: 1000,
    });
    this.cache.set(tenantId, { at: Date.now(), answers });
    return answers;
  }

  async match(tenantId: string, message: string): Promise<AnswerMatch<SavedAnswer> | null> {
    return findBestAnswer(message, await this.activeAnswers(tenantId));
  }

  recordUse(id: string): void {
    void this.prisma.savedAnswer
      .update({ where: { id }, data: { useCount: { increment: 1 }, lastUsedAt: new Date() } })
      .catch((err) => this.logger.warn(`Could not count use of saved answer ${id}: ${(err as Error).message}`));
  }

  /**
   * A customer question nothing could answer: keep it as a suggestion so the
   * owner can turn it into a saved answer. Repeats raise its count.
   */
  async recordUnanswered(tenantId: string, message: string, conversationId?: string): Promise<void> {
    const question = message.trim().replace(/\s+/g, ' ');
    const words = tokenize(question);
    if (words.length < 2 || question.length > 300) return;
    try {
      const suggestions = await this.prisma.savedAnswer.findMany({
        where: { tenantId, status: SavedAnswerStatus.SUGGESTED },
        select: { id: true, questions: true },
        take: MAX_SUGGESTIONS,
      });
      const same = suggestions.find((s) => s.questions.some((q) => scoreQuestion(question, q) >= SAME_SUGGESTION_SCORE));
      if (same) {
        await this.prisma.savedAnswer.update({ where: { id: same.id }, data: { askedCount: { increment: 1 } } });
        return;
      }
      if (suggestions.length >= MAX_SUGGESTIONS) return;
      await this.prisma.savedAnswer.create({
        data: { tenantId, status: SavedAnswerStatus.SUGGESTED, questions: [question], askedCount: 1, sourceConversationId: conversationId },
      });
    } catch (err) {
      this.logger.warn(`Could not record unanswered question for tenant=${tenantId}: ${(err as Error).message}`);
    }
  }

  /** "Try a question" in the dashboard: what would the customer get? */
  async test(tenantId: string, message: unknown, language: unknown) {
    if (typeof message !== 'string' || !message.trim()) throw new BadRequestException('Type a question to try.');
    const lang: LanguageTag = isLanguageTag(language) ? language : 'en';
    const m = await this.match(tenantId, message.slice(0, 1000));
    if (!m || m.score < HINT_MATCH_SCORE) return { matched: false as const };
    const reply = answerInLanguage(m.answer, lang);
    return {
      matched: true as const,
      wouldReply: m.score >= DIRECT_MATCH_SCORE,
      score: Math.round(m.score * 100) / 100,
      savedAnswerId: m.answer.id,
      matchedQuestion: m.question,
      reply: reply.text,
      replyLanguageMissing: !reply.exact,
    };
  }

  // ── Savings report ─────────────────────────────────────────────────────

  async stats(tenantId: string, days = 30) {
    const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 86_400_000);
    const rows = await this.prisma.$queryRaw<{ source: string; count: bigint }[]>(Prisma.sql`
      SELECT COALESCE(metadata->>'replySource', 'ai') AS source, COUNT(*)::bigint AS count
      FROM messages
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${since}
        AND (sender = 'AI' OR (sender = 'HUMAN_AGENT' AND metadata->>'replySource' IS NOT NULL))
      GROUP BY 1`);
    const by: Record<string, number> = {};
    for (const r of rows) by[r.source] = Number(r.count);
    const ai = by.ai ?? 0;
    const savedAnswers = by.saved_answer ?? 0;
    const quickReplies = by.template ?? 0;
    const handedToStaff = by.handoff ?? 0;
    const withoutAi = savedAnswers + quickReplies;
    const total = ai + withoutAi + handedToStaff;

    // Average AI cost of a customer reply, to estimate what the AI-free replies saved.
    const spend = await this.prisma.aiUsageLog.aggregate({
      where: { tenantId, conversationId: { not: null }, createdAt: { gte: since } },
      _sum: { estimatedCostUsd: true },
    });
    const aiSpendUsd = Number(spend._sum.estimatedCostUsd ?? 0);
    const avgCostPerAiReply = ai > 0 ? aiSpendUsd / ai : null;

    const suggestions = await this.prisma.savedAnswer.count({ where: { tenantId, status: SavedAnswerStatus.SUGGESTED } });

    return {
      days,
      totalReplies: total,
      aiReplies: ai,
      savedAnswerReplies: savedAnswers,
      quickReplies,
      handedToStaff,
      answeredWithoutAi: withoutAi,
      withoutAiPercent: total ? Math.round((withoutAi / total) * 100) : 0,
      aiSpendUsd: Math.round(aiSpendUsd * 10000) / 10000,
      estimatedSavedUsd: avgCostPerAiReply === null ? null : Math.round(avgCostPerAiReply * withoutAi * 10000) / 10000,
      openSuggestions: suggestions,
    };
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
