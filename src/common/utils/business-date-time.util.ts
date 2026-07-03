import { BadRequestException } from '@nestjs/common';

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

interface ParsedBusinessDateTime {
  date: Date;
  localDateTime: string;
}

const ISO_WITH_OFFSET_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_LOCAL_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const BR_LOCAL_REGEX =
  /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

export function parseBusinessDateTime(
  value: string,
  fieldLabel: string,
  timeZone = 'America/Sao_Paulo',
): ParsedBusinessDateTime {
  const rawValue = value?.trim();

  if (!rawValue) {
    throw new BadRequestException(`${fieldLabel} é obrigatório`);
  }

  const isoWithOffsetMatch = ISO_WITH_OFFSET_REGEX.exec(rawValue);
  if (isoWithOffsetMatch) {
    const parts = buildPartsFromIsoOffset(isoWithOffsetMatch, fieldLabel);
    const date = new Date(rawValue);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldLabel} é inválido`);
    }

    return {
      date,
      localDateTime: formatDateTimeForInput(date, timeZone),
    };
  }

  const isoLocalMatch = ISO_LOCAL_REGEX.exec(rawValue);
  if (isoLocalMatch) {
    const parts = buildPartsFromIsoLocal(isoLocalMatch, fieldLabel);
    const date = convertLocalDateTimeToUtc(parts, timeZone, fieldLabel);

    return {
      date,
      localDateTime: formatPartsForInput(parts),
    };
  }

  const brLocalMatch = BR_LOCAL_REGEX.exec(rawValue);
  if (brLocalMatch) {
    const parts = buildPartsFromBrLocal(brLocalMatch, fieldLabel);
    const date = convertLocalDateTimeToUtc(parts, timeZone, fieldLabel);

    return {
      date,
      localDateTime: formatPartsForInput(parts),
    };
  }

  throw new BadRequestException(
    `${fieldLabel} deve estar em um dos formatos aceitos: YYYY-MM-DDTHH:mm, DD/MM/YYYY HH:mm ou ISO com fuso`,
  );
}

export function formatDateTimeForInput(
  value: Date,
  timeZone = 'America/Sao_Paulo',
): string {
  const parts = getDatePartsInTimeZone(value, timeZone);
  return formatPartsForInput({
    ...parts,
    millisecond: 0,
  });
}

function buildPartsFromIsoOffset(
  match: RegExpExecArray,
  fieldLabel: string,
): LocalDateTimeParts {
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
    millisecond: match[8] ? Number(match[8].padEnd(3, '0')) : 0,
  };

  validateCalendarParts(parts, fieldLabel);
  validateMinutePrecision(parts, fieldLabel);
  return parts;
}

function buildPartsFromIsoLocal(
  match: RegExpExecArray,
  fieldLabel: string,
): LocalDateTimeParts {
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
    millisecond: 0,
  };

  validateCalendarParts(parts, fieldLabel);
  validateMinutePrecision(parts, fieldLabel);
  return parts;
}

function buildPartsFromBrLocal(
  match: RegExpExecArray,
  fieldLabel: string,
): LocalDateTimeParts {
  const parts = {
    year: Number(match[3]),
    month: Number(match[2]),
    day: Number(match[1]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
    millisecond: 0,
  };

  validateCalendarParts(parts, fieldLabel);
  validateMinutePrecision(parts, fieldLabel);
  return parts;
}

function validateCalendarParts(
  parts: LocalDateTimeParts,
  fieldLabel: string,
): void {
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31 ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    parts.second < 0 ||
    parts.second > 59
  ) {
    throw new BadRequestException(`${fieldLabel} é inválido`);
  }

  const testDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );

  if (
    testDate.getUTCFullYear() !== parts.year ||
    testDate.getUTCMonth() !== parts.month - 1 ||
    testDate.getUTCDate() !== parts.day ||
    testDate.getUTCHours() !== parts.hour ||
    testDate.getUTCMinutes() !== parts.minute
  ) {
    throw new BadRequestException(`${fieldLabel} é inválido`);
  }
}

function validateMinutePrecision(
  parts: LocalDateTimeParts,
  fieldLabel: string,
): void {
  if (parts.second !== 0 || parts.millisecond !== 0) {
    throw new BadRequestException(
      `${fieldLabel} deve ser informado com precisão de minuto (HH:mm)`,
    );
  }
}

function convertLocalDateTimeToUtc(
  parts: LocalDateTimeParts,
  timeZone: string,
  fieldLabel: string,
): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );

  let result = new Date(
    utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone),
  );
  const correctedOffset = getTimeZoneOffsetMs(result, timeZone);
  result = new Date(utcGuess - correctedOffset);

  const roundTrip = getDatePartsInTimeZone(result, timeZone);

  if (
    roundTrip.year !== parts.year ||
    roundTrip.month !== parts.month ||
    roundTrip.day !== parts.day ||
    roundTrip.hour !== parts.hour ||
    roundTrip.minute !== parts.minute
  ) {
    throw new BadRequestException(
      `${fieldLabel} é inválido para o fuso ${timeZone}`,
    );
  }

  return result;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getDatePartsInTimeZone(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const rawParts = formatter.formatToParts(date);
  const partMap = Object.fromEntries(
    rawParts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: partMap.year,
    month: partMap.month,
    day: partMap.day,
    hour: partMap.hour,
    minute: partMap.minute,
    second: partMap.second,
  };
}

function formatPartsForInput(parts: LocalDateTimeParts): string {
  return `${parts.year.toString().padStart(4, '0')}-${parts.month
    .toString()
    .padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}T${parts.hour
    .toString()
    .padStart(2, '0')}:${parts.minute.toString().padStart(2, '0')}`;
}
