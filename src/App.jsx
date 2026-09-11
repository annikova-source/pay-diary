import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

const meals = [
  { id: 'morning', icon: '🌅', name: 'Утро' },
  { id: 'day', icon: '☀️', name: 'День' },
  { id: 'evening', icon: '🌆', name: 'Вечер' },
  { id: 'night', icon: '🌙', name: 'Ночь' },
]

const vomitingOptions = ['Не блевал', 'Блевал']
const stoolOptions = ['Нормальный', 'Мягкий', 'Жидкий']

// Кастомное поле времени вместо native input[type="time"].
// На iOS Safari нативный time-control может выходить за границы контейнера.
function TimeInput({ value, onChange }) {
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const minutesRef = useRef(null)

  useEffect(() => {
    const match = String(value || '').slice(0, 5).match(/^(\d{1,2})(?::(\d{1,2}))?$/)
    if (!match) { setHours(''); setMinutes(''); return }
    setHours(match[1].padStart(2, '0'))
    setMinutes((match[2] || '').padStart(2, '0'))
  }, [value])

  const publish = (h, m) => {
    if (h.length === 2 && m.length === 2) onChange(`${h}:${m}`)
    else if (!h && !m) onChange('')
  }

  const handleHoursChange = (event) => {
    const h = event.target.value.replace(/\D/g, '').slice(0, 2)
    setHours(h)
    publish(h, minutes)
  }

  const handleMinutesChange = (event) => {
    const m = event.target.value.replace(/\D/g, '').slice(0, 2)
    setMinutes(m)
    publish(hours, m)
  }

  const normalize = () => {
    if (!hours && !minutes) { onChange(''); return }
    const h = String(Math.min(23, Number(hours || 0))).padStart(2, '0')
    const m = String(Math.min(59, Number(minutes || 0))).padStart(2, '0')
    setHours(h); setMinutes(m); onChange(`${h}:${m}`)
  }

  const handleHoursKeyDown = (event) => {
    if (event.key === ':') { event.preventDefault(); minutesRef.current?.focus() }
  }

  return (
    <div className="time-input">
      <input className="input time-part" type="text" inputMode="numeric" autoComplete="off" maxLength={2} placeholder="ЧЧ" value={hours} onChange={handleHoursChange} onBlur={normalize} onKeyDown={handleHoursKeyDown} aria-label="Часы" />
      <span className="time-separator">:</span>
      <input ref={minutesRef} className="input time-part" type="text" inputMode="numeric" autoComplete="off" maxLength={2} placeholder="ММ" value={minutes} onChange={handleMinutesChange} onBlur={normalize} aria-label="Минуты" />
    </div>
  )
}

const getDateString = (date = new Date()) => {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  )
}

const formatDate = (dateString) => {
  const [year, month, day] = dateString.split('-')

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  ).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const formatShortDate = (dateString) => {
  const [year, month, day] = dateString.split('-')

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  ).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
}

const formatDuration = (start, end) => {
  if (!start || !end) return ''

  const startParts = start.slice(0, 5).split(':').map(Number)
  const endParts = end.slice(0, 5).split(':').map(Number)

  const startMinutes =
    startParts[0] * 60 + startParts[1]

  const endMinutes =
    endParts[0] * 60 + endParts[1]

  let difference = endMinutes - startMinutes

  if (difference < 0) {
    difference += 24 * 60
  }

  if (difference === 0) return ''

  const hours = Math.floor(difference / 60)
  const minutes = difference % 60

  if (hours > 0 && minutes > 0) {
    return `${hours} ч ${minutes} мин`
  }

  if (hours > 0) {
    return `${hours} ч`
  }

  return `${minutes} мин`
}

const getDurationMinutes = (start, end) => {
  if (!start || !end) return 0

  const startParts = start.slice(0, 5).split(':').map(Number)
  const endParts = end.slice(0, 5).split(':').map(Number)

  const startMinutes =
    startParts[0] * 60 + startParts[1]

  const endMinutes =
    endParts[0] * 60 + endParts[1]

  let difference = endMinutes - startMinutes

  if (difference < 0) {
    difference += 24 * 60
  }

  return difference
}

function App() {
  const today = getDateString()

  const [entries, setEntries] = useState({})
  const [dailyRecord, setDailyRecord] = useState(null)
  const [stoolRecords, setStoolRecords] = useState([])
  const [walkRecords, setWalkRecords] = useState([])

  const [loading, setLoading] = useState(true)
  const [activeMeal, setActiveMeal] = useState(null)
  const [dailyFormOpen, setDailyFormOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('feedings')

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyMode, setHistoryMode] = useState('today')
  const [selectedDate, setSelectedDate] = useState(today)
  const [rangeStart, setRangeStart] = useState(null)
  const [rangeEnd, setRangeEnd] = useState(null)
  const [historyData, setHistoryData] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const historyRequestId = useRef(0)

  const [calendarMonth, setCalendarMonth] = useState(
    new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    )
  )

  const [time, setTime] = useState('')
  const [grams, setGrams] = useState('110')
  const [vomiting, setVomiting] = useState('Не блевал')
  const [vomitingTime, setVomitingTime] = useState('')

  const [stoolType, setStoolType] = useState('Нормальный')
  const [stoolTime, setStoolTime] = useState('')

  const [walkStart, setWalkStart] = useState('')
  const [walkEnd, setWalkEnd] = useState('')

  const [weight, setWeight] = useState('')
  const [medication, setMedication] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    loadTodayData()
  }, [])

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory(historyMode, selectedDate, rangeStart, rangeEnd)
    }
  }, [activeTab, historyMode, selectedDate, rangeStart, rangeEnd])

  const loadTodayData = async () => {
    setLoading(true)

    const [
      feedingResult,
      stoolResult,
      walkResult,
      dailyResult,
    ] = await Promise.all([
      supabase
        .from('feedings')
        .select('*')
        .eq('entry_date', today)
        .order('entry_time', { ascending: true }),

      supabase
        .from('stool_records')
        .select('*')
        .eq('entry_date', today)
        .order('entry_time', { ascending: true }),

      supabase
        .from('walk_records')
        .select('*')
        .eq('entry_date', today)
        .order('start_time', { ascending: true }),

      supabase
        .from('daily_records')
        .select('*')
        .eq('entry_date', today)
        .maybeSingle(),
    ])

    if (feedingResult.error) {
      console.error(
        'Ошибка загрузки кормлений:',
        feedingResult.error
      )
    } else {
      const mapped = {}

      for (const row of feedingResult.data || []) {
        mapped[row.meal] = {
          ...row,
          time: row.entry_time.slice(0, 5),
          vomiting_time: row.vomiting_time
            ? row.vomiting_time.slice(0, 5)
            : '',
        }
      }

      setEntries(mapped)
    }

    if (stoolResult.error) {
      console.error(
        'Ошибка загрузки стула:',
        stoolResult.error
      )
    } else {
      setStoolRecords(
        (stoolResult.data || []).map((row) => ({
          ...row,
          time: row.entry_time.slice(0, 5),
        }))
      )
    }

    if (walkResult.error) {
      console.error(
        'Ошибка загрузки прогулок:',
        walkResult.error
      )
    } else {
      setWalkRecords(walkResult.data || [])
    }

    if (dailyResult.error) {
      console.error(
        'Ошибка загрузки состояния:',
        dailyResult.error
      )
    } else {
      setDailyRecord(dailyResult.data)
    }

    setLoading(false)
  }

  const loadHistory = async (
    mode = historyMode,
    date = selectedDate,
    rangeFrom = rangeStart,
    rangeTo = rangeEnd
  ) => {
    setHistoryLoading(true)

    // Токен запроса: только последний запуск имеет право писать в state.
    // Если пока шла загрузка пользователь переключил режим/дату,
    // устаревший ответ будет проигнорирован.
    const requestId = ++historyRequestId.current

    if (mode === '7days') {
      await loadSevenDays(requestId)
    } else if (
      mode === 'calendar' &&
      rangeFrom &&
      rangeTo
    ) {
      await loadRange(rangeFrom, rangeTo, requestId)
    } else {
      await loadSingleHistoryDate(
        mode === 'yesterday'
          ? getDateString(
              new Date(
                new Date().getFullYear(),
                new Date().getMonth(),
                new Date().getDate() - 1
              )
            )
          : date,
        requestId
      )
    }

    if (requestId !== historyRequestId.current) return

    setHistoryLoading(false)
  }

  const loadSingleHistoryDate = async (date, requestId) => {
    const [
      feedingResult,
      stoolResult,
      walkResult,
      dailyResult,
    ] = await Promise.all([
      supabase
        .from('feedings')
        .select('*')
        .eq('entry_date', date)
        .order('entry_time', {
          ascending: true,
        }),

      supabase
        .from('stool_records')
        .select('*')
        .eq('entry_date', date)
        .order('entry_time', {
          ascending: true,
        }),

      supabase
        .from('walk_records')
        .select('*')
        .eq('entry_date', date)
        .order('start_time', {
          ascending: true,
        }),

      supabase
        .from('daily_records')
        .select('*')
        .eq('entry_date', date)
        .maybeSingle(),
    ])

    if (requestId !== historyRequestId.current) return

    setHistoryData({
      date,
      feedings: feedingResult.data || [],
      stools: stoolResult.data || [],
      walks: walkResult.data || [],
      daily: dailyResult.data || null,
    })
  }

  const loadSevenDays = async (requestId) => {
    const dates = []

    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      dates.push(getDateString(date))
    }

    const [
      feedingResult,
      stoolResult,
      walkResult,
      dailyResult,
    ] = await Promise.all([
      supabase
        .from('feedings')
        .select('*')
        .in('entry_date', dates)
        .order('entry_time', {
          ascending: true,
        }),

      supabase
        .from('stool_records')
        .select('*')
        .in('entry_date', dates)
        .order('entry_time', {
          ascending: true,
        }),

      supabase
        .from('walk_records')
        .select('*')
        .in('entry_date', dates)
        .order('start_time', {
          ascending: true,
        }),

      supabase
        .from('daily_records')
        .select('*')
        .in('entry_date', dates),
    ])

    if (requestId !== historyRequestId.current) return

    setHistoryData({
      dates,
      feedings: feedingResult.data || [],
      stools: stoolResult.data || [],
      walks: walkResult.data || [],
      daily: dailyResult.data || [],
    })
  }

  const loadRange = async (
    rangeFrom,
    rangeTo,
    requestId
  ) => {
    const dates = []

    const [startYear, startMonth, startDay] =
      rangeFrom.split('-').map(Number)
    const [endYear, endMonth, endDay] =
      rangeTo.split('-').map(Number)

    const current = new Date(
      startYear,
      startMonth - 1,
      startDay
    )
    const end = new Date(
      endYear,
      endMonth - 1,
      endDay
    )

    while (current <= end) {
      dates.push(getDateString(current))
      current.setDate(current.getDate() + 1)
    }

    if (dates.length > 62) {
      if (
        requestId === historyRequestId.current
      ) {
        setHistoryLoading(false)
      }

      alert(
        'Период слишком большой. Выберите не более 62 дней.'
      )
      return
    }

    const [
      feedingResult,
      stoolResult,
      walkResult,
      dailyResult,
    ] = await Promise.all([
      supabase
        .from('feedings')
        .select('*')
        .in('entry_date', dates)
        .order('entry_time', {
          ascending: true,
        }),

      supabase
        .from('stool_records')
        .select('*')
        .in('entry_date', dates)
        .order('entry_time', {
          ascending: true,
        }),

      supabase
        .from('walk_records')
        .select('*')
        .in('entry_date', dates)
        .order('start_time', {
          ascending: true,
        }),

      supabase
        .from('daily_records')
        .select('*')
        .in('entry_date', dates),
    ])

    if (requestId !== historyRequestId.current) return

    setHistoryData({
      dates,
      feedings: feedingResult.data || [],
      stools: stoolResult.data || [],
      walks: walkResult.data || [],
      daily: dailyResult.data || [],
    })
  }

  const openForm = (mealId) => {
    const existing = entries[mealId]
    const nowTime = new Date()

    setActiveMeal(mealId)

    setTime(
      existing?.time ??
        nowTime.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        })
    )

    setGrams(
      existing ? String(existing.grams) : '110'
    )

    setVomiting(
      existing?.vomiting ?? 'Не блевал'
    )

    setVomitingTime(
      existing?.vomiting_time
        ? existing.vomiting_time.slice(0, 5)
        : ''
    )
  }

  const saveEntry = async () => {
    const trimmed = time.trim()

    if (!/^\d{1,2}:\d{2}$/.test(trimmed)) {
      alert(
        'Введите время в формате ЧЧ:ММ, например 08:00'
      )
      return
    }

    const [hours, minutes] = trimmed.split(':')

    const normalized =
      hours.padStart(2, '0') +
      ':' +
      minutes

    const normalizedVomitingTime =
      vomiting === 'Блевал' && vomitingTime
        ? vomitingTime
        : null

    const existing = entries[activeMeal]

    const payload = {
      meal: activeMeal,
      entry_date: today,
      entry_time: normalized,
      grams: Number(grams),
      ate: 'Поел',
      vomiting,
      vomiting_time: normalizedVomitingTime,
    }

    let savedRow

    if (existing?.id) {
      const { data, error } = await supabase
        .from('feedings')
        .update(payload)
        .eq('id', existing.id)
        .select()

      if (error) {
        alert(
          'Ошибка сохранения: ' +
            error.message
        )
        return
      }

      savedRow = data[0]
    } else {
      const { data, error } = await supabase
        .from('feedings')
        .insert(payload)
        .select()

      if (error) {
        alert(
          'Ошибка сохранения: ' +
            error.message
        )
        return
      }

      savedRow = data[0]
    }

    setEntries((current) => ({
      ...current,
      [activeMeal]: {
        ...savedRow,
        time: savedRow.entry_time.slice(0, 5),
        vomiting_time: savedRow.vomiting_time
          ? savedRow.vomiting_time.slice(0, 5)
          : '',
      },
    }))

    setActiveMeal(null)
  }

  const deleteEntry = async () => {
    const existing = entries[activeMeal]

    if (!existing?.id) return

    const { error } = await supabase
      .from('feedings')
      .delete()
      .eq('id', existing.id)

    if (error) {
      alert(
        'Ошибка удаления: ' +
          error.message
      )
      return
    }

    setEntries((current) => {
      const updated = { ...current }
      delete updated[activeMeal]
      return updated
    })

    setActiveMeal(null)
  }

  const addStoolRecord = async () => {
    if (!stoolTime) {
      alert('Укажите время стула')
      return
    }

    const payload = {
      entry_date: today,
      entry_time: stoolTime,
      stool: stoolType,
    }

    const { data, error } = await supabase
      .from('stool_records')
      .insert(payload)
      .select()

    if (error) {
      alert(
        'Ошибка сохранения стула: ' +
          error.message
      )
      return
    }

    setStoolRecords((current) => [
      ...current,
      {
        ...data[0],
        time: data[0].entry_time.slice(0, 5),
      },
    ])

    setStoolTime('')
  }

  const deleteStoolRecord = async (id) => {
    const { error } = await supabase
      .from('stool_records')
      .delete()
      .eq('id', id)

    if (error) {
      alert(
        'Ошибка удаления стула: ' +
          error.message
      )
      return
    }

    setStoolRecords((current) =>
      current.filter(
        (record) => record.id !== id
      )
    )
  }

  const addWalkRecord = async () => {
    if (!walkStart || !walkEnd) {
      alert(
        'Укажите начало и конец прогулки'
      )
      return
    }

    const duration = formatDuration(
      walkStart,
      walkEnd
    )

    if (!duration) {
      alert(
        'Время окончания должно отличаться от времени начала'
      )
      return
    }

    const payload = {
      entry_date: today,
      start_time: walkStart,
      end_time: walkEnd,
    }

    const { data, error } = await supabase
      .from('walk_records')
      .insert(payload)
      .select()

    if (error) {
      alert(
        'Ошибка сохранения прогулки: ' +
          error.message
      )
      return
    }

    setWalkRecords((current) => [
      ...current,
      data[0],
    ])

    setWalkStart('')
    setWalkEnd('')
  }

  const deleteWalkRecord = async (id) => {
    const { error } = await supabase
      .from('walk_records')
      .delete()
      .eq('id', id)

    if (error) {
      alert(
        'Ошибка удаления прогулки: ' +
          error.message
      )
      return
    }

    setWalkRecords((current) =>
      current.filter(
        (record) => record.id !== id
      )
    )
  }

  const openDailyForm = () => {
    setWeight(
      dailyRecord?.weight !== null &&
        dailyRecord?.weight !== undefined
        ? String(dailyRecord.weight)
        : ''
    )

    setMedication(
      dailyRecord?.medication ?? ''
    )

    setNote(
      dailyRecord?.note ?? ''
    )

    setStoolTime('')
    setWalkStart('')
    setWalkEnd('')

    setDailyFormOpen(true)
  }

  const saveDailyRecord = async () => {
    const payload = {
      entry_date: today,
      weight:
        weight === ''
          ? null
          : Number(weight),
      medication:
        medication.trim() || null,
      note:
        note.trim() || null,
    }

    let savedRow

    if (dailyRecord?.id) {
      const { data, error } = await supabase
        .from('daily_records')
        .update(payload)
        .eq('id', dailyRecord.id)
        .select()

      if (error) {
        alert(
          'Ошибка сохранения: ' +
            error.message
        )
        return
      }

      savedRow = data[0]
    } else {
      const { data, error } = await supabase
        .from('daily_records')
        .insert(payload)
        .select()

      if (error) {
        alert(
          'Ошибка сохранения: ' +
            error.message
        )
        return
      }

      savedRow = data[0]
    }

    setDailyRecord(savedRow)
    setDailyFormOpen(false)
  }

  const openHistory = (mode = 'today') => {
    setHistoryMode(mode)

    if (mode === 'yesterday') {
      const yesterday = new Date()
      yesterday.setDate(
        yesterday.getDate() - 1
      )
      setSelectedDate(
        getDateString(yesterday)
      )
    }

    setHistoryOpen(true)
  }

  const selectCalendarDate = (date) => {
    if (!rangeStart || rangeEnd) {
      // первый клик — начало периода, пока показываем этот день как обычно
      setRangeStart(date)
      setRangeEnd(null)
      setSelectedDate(date)
    } else if (date < rangeStart) {
      // клик раньше начала — начинаем выбор периода заново
      setRangeStart(date)
    } else {
      // второй клик — конец периода
      setRangeEnd(date)
    }

    setHistoryMode('calendar')
  }

  const clearRange = () => {
    setRangeStart(null)
    setRangeEnd(null)
  }

  const previousMonth = () => {
    setCalendarMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() - 1,
          1
        )
    )
  }

  const nextMonth = () => {
    setCalendarMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + 1,
          1
        )
    )
  }

  const historyTotals = useMemo(() => {
    if (!historyData) {
      return {
        grams: 0,
        vomiting: 0,
        stool: 0,
        walks: 0,
        walkMinutes: 0,
      }
    }

    const feedings = historyData.feedings || []
    const stools = historyData.stools || []
    const walks = historyData.walks || []

    return {
      grams: feedings.reduce(
        (sum, item) =>
          sum + Number(item.grams || 0),
        0
      ),

      vomiting: feedings.filter(
        (item) =>
          item.vomiting === 'Блевал'
      ).length,

      stool: stools.length,

      walks: walks.length,

      walkMinutes: walks.reduce(
        (sum, item) =>
          sum +
          getDurationMinutes(
            item.start_time,
            item.end_time
          ),
        0
      ),
    }
  }, [historyData])

  const totalWalkMinutes = walkRecords.reduce(
    (total, record) =>
      total +
      getDurationMinutes(
        record.start_time,
        record.end_time
      ),
    0
  )

  const totalWalkHours = Math.floor(
    totalWalkMinutes / 60
  )

  const totalWalkRest =
    totalWalkMinutes % 60

  const activeMealData = meals.find(
    (meal) => meal.id === activeMeal
  )

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()

    const firstDay = new Date(
      year,
      month,
      1
    ).getDay()

    const mondayOffset =
      firstDay === 0 ? 6 : firstDay - 1

    const daysInMonth = new Date(
      year,
      month + 1,
      0
    ).getDate()

    const result = []

    for (let i = 0; i < mondayOffset; i++) {
      result.push(null)
    }

    for (
      let day = 1;
      day <= daysInMonth;
      day++
    ) {
      result.push(
        getDateString(
          new Date(year, month, day)
        )
      )
    }

    return result
  }, [calendarMonth])

  const renderHistorySingleDay = () => {
    // Защита от несоответствия формы данных: при смене режима один рендер
    // происходит со старым historyData (например, за период/7 дней — там
    // нет поля date). Без проверки formatDate(undefined) бросил бы TypeError
    // и уронил бы всё приложение белым экраном.
    if (!historyData || !historyData.date) return null

    const feedings = historyData.feedings || []
    const stools = historyData.stools || []
    const walks = historyData.walks || []
    const daily = historyData.daily

    const walkMinutes =
      historyTotals.walkMinutes

    const walkHours =
      Math.floor(walkMinutes / 60)

    const walkRest =
      walkMinutes % 60

    return (
      <>
        <div className="history-date-title">
          {formatDate(historyData.date)}
        </div>

        <div className="history-stats">
          <div className="history-stat">
            <span className="history-stat-icon">
              🍚
            </span>
            <strong>
              {historyTotals.grams} г
            </strong>
            <small>
              съедено
            </small>
          </div>

          <div className="history-stat">
            <span className="history-stat-icon">
              🤢
            </span>
            <strong>
              {historyTotals.vomiting}
            </strong>
            <small>
              рвоты
            </small>
          </div>

          <div className="history-stat">
            <span className="history-stat-icon">
              💩
            </span>
            <strong>
              {historyTotals.stool}
            </strong>
            <small>
              стула
            </small>
          </div>

          <div className="history-stat">
            <span className="history-stat-icon">
              🐕
            </span>
            <strong>
              {walkHours > 0
                ? `${walkHours} ч ${walkRest} мин`
                : `${walkMinutes} мин`}
            </strong>
            <small>
              прогулки
            </small>
          </div>
        </div>

        <div className="history-card">
          <h3>🍽 Кормления</h3>

          {feedings.length === 0 ? (
            <div className="history-empty">
              Кормлений нет
            </div>
          ) : (
            <div className="history-list">
              {feedings.map((feeding) => (
                <div
                  className="history-list-row"
                  key={feeding.id}
                >
                  <span>
                    {meals.find(
                      (meal) =>
                        meal.id ===
                        feeding.meal
                    )?.icon}{' '}
                    {
                      meals.find(
                        (meal) =>
                          meal.id ===
                          feeding.meal
                      )?.name
                    }
                  </span>

                  <span>
                    {feeding.entry_time.slice(
                      0,
                      5
                    )}
                  </span>

                  <strong>
                    {feeding.grams} г
                  </strong>

                  {feeding.vomiting ===
                    'Блевал' && (
                    <span className="history-warning">
                      🤢
                      {feeding.vomiting_time
                        ? ` ${feeding.vomiting_time}`
                        : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="history-card">
          <h3>💩 Стул</h3>

          {stools.length === 0 ? (
            <div className="history-empty">
              Записей нет
            </div>
          ) : (
            <div className="history-list">
              {stools.map((stool) => (
                <div
                  className="history-list-row"
                  key={stool.id}
                >
                  <span>
                    {stool.entry_time.slice(
                      0,
                      5
                    )}
                  </span>

                  <strong>
                    {stool.stool}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="history-card">
          <h3>🐕 Прогулки</h3>

          {walks.length === 0 ? (
            <div className="history-empty">
              Прогулок нет
            </div>
          ) : (
            <div className="history-list">
              {walks.map((walk) => (
                <div
                  className="history-list-row"
                  key={walk.id}
                >
                  <span>
                    {walk.start_time.slice(
                      0,
                      5
                    )}{' '}
                    –{' '}
                    {walk.end_time.slice(
                      0,
                      5
                    )}
                  </span>

                  <strong>
                    {formatDuration(
                      walk.start_time,
                      walk.end_time
                    )}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="history-card">
          <h3>🐾 Состояние</h3>

          <div className="history-details">
            <div>
              <span>⚖️ Вес</span>
              <strong>
                {daily?.weight != null
                  ? `${daily.weight} кг`
                  : '—'}
              </strong>
            </div>

            <div>
              <span>💊 Лекарство</span>
              <strong>
                {daily?.medication ||
                  '—'}
              </strong>
            </div>

            <div>
              <span>📝 Заметка</span>
              <strong>
                {daily?.note || '—'}
              </strong>
            </div>
          </div>
        </div>
      </>
    )
  }

  const renderSevenDays = () => {
    // Защита от несоответствия формы данных: этот рендерер
    // работает только со структурой ответа за 7 дней.
    if (!historyData || !historyData.dates) return null

    const dailyRows =
      historyData.dates.map((date) => {
        const feedings =
          historyData.feedings.filter(
            (item) =>
              item.entry_date === date
          )

        const stools =
          historyData.stools.filter(
            (item) =>
              item.entry_date === date
          )

        const walks =
          historyData.walks.filter(
            (item) =>
              item.entry_date === date
          )

        const daily =
          historyData.daily.find(
            (item) =>
              item.entry_date === date
          )

        const grams = feedings.reduce(
          (sum, item) =>
            sum + Number(item.grams || 0),
          0
        )

        const vomiting =
          feedings.filter(
            (item) =>
              item.vomiting === 'Блевал'
          ).length

        const walkMinutes =
          walks.reduce(
            (sum, item) =>
              sum +
              getDurationMinutes(
                item.start_time,
                item.end_time
              ),
            0
          )

        return {
          date,
          feedings,
          stools,
          walks,
          daily,
          grams,
          vomiting,
          walkMinutes,
        }
      })

    return (
      <>
        <div className="history-seven-summary">
          <div>
            <span>🍚</span>
            <strong>
              {historyTotals.grams} г
            </strong>
            <small>
              за 7 дней
            </small>
          </div>

          <div>
            <span>🤢</span>
            <strong>
              {historyTotals.vomiting}
            </strong>
            <small>
              рвоты
            </small>
          </div>

          <div>
            <span>💩</span>
            <strong>
              {historyTotals.stool}
            </strong>
            <small>
              стула
            </small>
          </div>

          <div>
            <span>🐕</span>
            <strong>
              {historyTotals.walks}
            </strong>
            <small>
              прогулок
            </small>
          </div>
        </div>

        <div className="history-card">
          <h3>Последние 7 дней</h3>

          <div className="seven-day-list">
            {dailyRows.map((row) => {
              const hours = Math.floor(
                row.walkMinutes / 60
              )

              const minutes =
                row.walkMinutes % 60

              return (
                <button
                  className="seven-day-row"
                  key={row.date}
                  onClick={() => {
                    clearRange()
                    setSelectedDate(
                      row.date
                    )
                    setHistoryMode(
                      'calendar'
                    )
                  }}
                >
                  <div className="seven-day-date">
                    <strong>
                      {formatShortDate(
                        row.date
                      )}
                    </strong>

                    {row.date === today && (
                      <span>сегодня</span>
                    )}
                  </div>

                  <div className="seven-day-value">
                    🍚 {row.grams} г
                  </div>

                  <div className="seven-day-value">
                    🤢 {row.vomiting}
                  </div>

                  <div className="seven-day-value">
                    💩 {row.stools.length}
                  </div>

                  <div className="seven-day-value">
                    🐕{' '}
                    {hours > 0
                      ? `${hours}ч ${minutes}м`
                      : `${minutes}м`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  const renderRange = () => {
    // Защита от несоответствия формы данных: рендерер периода
    // работает только со структурой ответа с массивом dates.
    if (!historyData || !historyData.dates) {
      return null
    }

    const dailyRows =
      historyData.dates.map((date) => {
        const feedings =
          historyData.feedings.filter(
            (item) =>
              item.entry_date === date
          )

        const stools =
          historyData.stools.filter(
            (item) =>
              item.entry_date === date
          )

        const walks =
          historyData.walks.filter(
            (item) =>
              item.entry_date === date
          )

        const grams = feedings.reduce(
          (sum, item) =>
            sum + Number(item.grams || 0),
          0
        )

        const vomiting =
          feedings.filter(
            (item) =>
              item.vomiting === 'Блевал'
          ).length

        const walkMinutes =
          walks.reduce(
            (sum, item) =>
              sum +
              getDurationMinutes(
                item.start_time,
                item.end_time
              ),
            0
          )

        return {
          date,
          stools,
          grams,
          vomiting,
          walkMinutes,
        }
      })

    return (
      <>
        <div className="history-date-title">
          {formatShortDate(rangeStart)} —{' '}
          {formatShortDate(rangeEnd)}
        </div>

        <div className="history-seven-summary">
          <div>
            <span>🍚</span>
            <strong>
              {historyTotals.grams} г
            </strong>
            <small>
              за период
            </small>
          </div>

          <div>
            <span>🤢</span>
            <strong>
              {historyTotals.vomiting}
            </strong>
            <small>
              рвоты
            </small>
          </div>

          <div>
            <span>💩</span>
            <strong>
              {historyTotals.stool}
            </strong>
            <small>
              стула
            </small>
          </div>

          <div>
            <span>🐕</span>
            <strong>
              {historyTotals.walks}
            </strong>
            <small>
              прогулок
            </small>
          </div>
        </div>

        <div className="history-card">
          <h3>По дням</h3>

          <div className="seven-day-list">
            {dailyRows.map((row) => {
              const hours = Math.floor(
                row.walkMinutes / 60
              )

              const minutes =
                row.walkMinutes % 60

              return (
                <button
                  className="seven-day-row"
                  key={row.date}
                  onClick={() => {
                    clearRange()
                    setSelectedDate(
                      row.date
                    )
                    setHistoryMode(
                      'calendar'
                    )
                  }}
                >
                  <div className="seven-day-date">
                    <strong>
                      {formatShortDate(
                        row.date
                      )}
                    </strong>

                    {row.date === today && (
                      <span>сегодня</span>
                    )}
                  </div>

                  <div className="seven-day-value">
                    🍚 {row.grams} г
                  </div>

                  <div className="seven-day-value">
                    🤢 {row.vomiting}
                  </div>

                  <div className="seven-day-value">
                    💩 {row.stools.length}
                  </div>

                  <div className="seven-day-value">
                    🐕{' '}
                    {hours > 0
                      ? `${hours}ч ${minutes}м`
                      : `${minutes}м`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  const monthName =
    calendarMonth.toLocaleDateString(
      'ru-RU',
      {
        month: 'long',
        year: 'numeric',
      }
    )

  return (
    <main className="app">
      <header className="header">

        <h1>Ежедневник для пса</h1>

        <p>Сегодня:
          {' '}
          {new Date().toLocaleDateString(
            'ru-RU',
            {
              day: 'numeric',
              month: 'long',
            }
          )}
          {loading
            ? ' · загрузка…'
            : ''}
        </p>
      </header>

      {activeTab === 'feedings' && (
      <>
        <section className="meals">
        {meals.map((meal) => {
          const entry = entries[meal.id]

          return (
            <article
              className="meal-card"
              key={meal.id}
              onClick={() =>
                openForm(meal.id)
              }
            >
              <div className="meal-header">
                <span className="meal-title">
                  {meal.icon} {meal.name}
                </span>

                {entry ? (
                  <span className="meal-time">
                    {entry.time}
                  </span>
                ) : (
                  <span className="empty">
                    —
                  </span>
                )}
              </div>

              {entry ? (
                <div className="meal-info">
                  <span>
                    {entry.grams} г
                  </span>

                  <span>
                    {entry.vomiting ===
                    'Блевал'
                      ? '🤢 Блевал' +
                        (entry.vomiting_time
                          ? ` в ${entry.vomiting_time}`
                          : '')
                      : '❌ Не блевал'}
                  </span>
                </div>
              ) : (
                <button
                  className="add-meal"
                  onClick={(event) => {
                    event.stopPropagation()
                    openForm(meal.id)
                  }}
                >
                  ＋ Добавить
                </button>
              )}
            </article>
          )
        })}
      </section>

        <button
          className="add-button"
          onClick={() =>
            openForm('morning')
          }
        >
          ＋ Добавить приём пищи
        </button>
      </>
      )}

      {activeTab === 'state' && (
      <section className="daily-section">
        <div className="daily-section-header">
          <h2>🐕 Состояние за день</h2>

          <button
            className="daily-edit-button"
            onClick={openDailyForm}
          >
            {dailyRecord
              ? 'Редактировать'
              : '＋ Добавить'}
          </button>
        </div>

        <div className="daily-record">
          <div className="daily-row">
            <span>💩 Стул</span>

            <strong>
              {stoolRecords.length > 0
                ? `${stoolRecords.length} ${
                    stoolRecords.length ===
                    1
                      ? 'раз'
                      : 'раза'
                  }`
                : 'Не указано'}
            </strong>
          </div>

          <div className="daily-row">
            <span>⚖️ Вес</span>

            <strong>
              {dailyRecord?.weight != null
                ? `${dailyRecord.weight} кг`
                : 'Не указано'}
            </strong>
          </div>

          <div className="daily-row">
            <span>💊 Лекарство</span>

            <strong>
              {dailyRecord?.medication ||
                'Не указано'}
            </strong>
          </div>

          <div className="daily-row">
            <span>🐕 Прогулки</span>

            <strong>
              {walkRecords.length > 0
                ? `${walkRecords.length} ${
                    walkRecords.length ===
                    1
                      ? 'прогулка'
                      : 'прогулки'
                  }`
                : 'Не указано'}
            </strong>
          </div>

          <div className="daily-row daily-note-row">
            <span>📝 Заметка</span>

            <strong>
              {dailyRecord?.note ||
                'Не указано'}
            </strong>
          </div>
        </div>
      </section>

      )}

      <nav className="bottom-tabbar" aria-label="Разделы дневника">
        <button type="button" className={activeTab === 'feedings' ? 'active' : ''} onClick={() => setActiveTab('feedings')}>
          <span className="tab-icon">🍽</span><span>Кормления</span>
        </button>
        <button type="button" className={activeTab === 'state' ? 'active' : ''} onClick={() => setActiveTab('state')}>
          <span className="tab-icon">🐾</span><span>Состояние</span>
        </button>
        <button type="button" className={activeTab === 'history' ? 'active' : ''} onClick={() => { setActiveTab('history'); setHistoryMode('today'); setSelectedDate(today) }}>
          <span className="tab-icon">📊</span><span>История</span>
        </button>
      </nav>

      {activeMeal && (
        <div
          className="overlay"
          onClick={() =>
            setActiveMeal(null)
          }
        >
          <div
            className="sheet"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <h2 className="sheet-title">
              {activeMealData?.icon}{' '}
              {activeMealData?.name}
            </h2>

            <div className="field">
              <label className="label">
                Время
              </label>

              <TimeInput
                value={time}
                onChange={setTime}
              />
            </div>

            <div className="field">
              <label className="label">
                Граммы
              </label>

              <input
                className="input"
                type="number"
                inputMode="numeric"
                value={grams}
                onChange={(event) =>
                  setGrams(event.target.value)
                }
              />
            </div>

            <div className="field">
              <label className="label">
                Рвота
              </label>

              <div className="segmented">
                {vomitingOptions.map(
                  (option) => (
                    <button
                      key={option}
                      className={
                        'segment ' +
                        (vomiting ===
                        option
                          ? 'active'
                          : '')
                      }
                      onClick={() => {
                        setVomiting(option)

                        if (
                          option ===
                          'Не блевал'
                        ) {
                          setVomitingTime('')
                        }
                      }}
                    >
                      {option}
                    </button>
                  )
                )}
              </div>
            </div>

            {vomiting === 'Блевал' && (
              <div className="field">
                <label className="label">
                  Время рвоты
                </label>

                <TimeInput
                  value={vomitingTime}
                  onChange={setVomitingTime}
                />
              </div>
            )}

            {entries[activeMeal]?.id && (
              <button
                className="delete-button"
                onClick={deleteEntry}
              >
                Удалить запись
              </button>
            )}

            <div className="sheet-actions">
              <button
                className="cancel-button"
                onClick={() =>
                  setActiveMeal(null)
                }
              >
                Отмена
              </button>

              <button
                className="save-button"
                onClick={saveEntry}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {dailyFormOpen && (
        <div
          className="overlay"
          onClick={() =>
            setDailyFormOpen(false)
          }
        >
          <div
            className="sheet"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <h2 className="sheet-title">
              🐕 Состояние за день
            </h2>

            <div className="field">
              <label className="label">
                💩 Стул
              </label>

              <div className="segmented">
                {stoolOptions.map(
                  (option) => (
                    <button
                      key={option}
                      className={
                        'segment ' +
                        (stoolType ===
                        option
                          ? 'active'
                          : '')
                      }
                      onClick={() =>
                        setStoolType(option)
                      }
                    >
                      {option}
                    </button>
                  )
                )}
              </div>

              <div className="field time-field">
                <label className="label">
                  Время стула
                </label>
                <TimeInput value={stoolTime} onChange={setStoolTime} />
              </div>

              <button
                className="add-meal"
                onClick={addStoolRecord}
              >
                ＋ Добавить стул
              </button>

              {stoolRecords.length >
                0 && (
                <div className="daily-list">
                  {stoolRecords.map(
                    (record) => (
                      <div
                        className="daily-list-item"
                        key={record.id}
                      >
                        <span>
                          {record.time} ·{' '}
                          {record.stool}
                        </span>

                        <button
                          className="delete-small-button"
                          onClick={() =>
                            deleteStoolRecord(
                              record.id
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="field">
              <label className="label">
                ⚖️ Вес, кг
              </label>

              <input
                className="input"
                type="number"
                step="0.1"
                inputMode="decimal"
                placeholder="Например: 12.4"
                value={weight}
                onChange={(event) =>
                  setWeight(
                    event.target.value
                  )
                }
              />
            </div>

            <div className="field">
              <label className="label">
                💊 Лекарство
              </label>

              <input
                className="input"
                type="text"
                placeholder="Название лекарства"
                value={medication}
                onChange={(event) =>
                  setMedication(
                    event.target.value
                  )
                }
              />
            </div>

            <div className="field">
              <label className="label">
                🐕 Прогулки
              </label>

              <div className="field time-field">
                <label className="label">Начало</label>
                <TimeInput value={walkStart} onChange={setWalkStart} />
              </div>

              <div className="field time-field">
                <label className="label">Конец</label>
                <TimeInput value={walkEnd} onChange={setWalkEnd} />
              </div>

              {walkStart &&
                walkEnd &&
                formatDuration(
                  walkStart,
                  walkEnd
                ) && (
                  <div className="walk-duration">
                    Длительность:{' '}
                    <strong>
                      {formatDuration(
                        walkStart,
                        walkEnd
                      )}
                    </strong>
                  </div>
                )}

              <button
                className="add-meal"
                onClick={addWalkRecord}
              >
                ＋ Добавить прогулку
              </button>

              {walkRecords.length >
                0 && (
                <div className="daily-list">
                  {walkRecords.map(
                    (record) => (
                      <div
                        className="daily-list-item"
                        key={record.id}
                      >
                        <span>
                          {record.start_time.slice(
                            0,
                            5
                          )}{' '}
                          –{' '}
                          {record.end_time.slice(
                            0,
                            5
                          )}{' '}
                          ·{' '}
                          {formatDuration(
                            record.start_time,
                            record.end_time
                          )}
                        </span>

                        <button
                          className="delete-small-button"
                          onClick={() =>
                            deleteWalkRecord(
                              record.id
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    )
                  )}

                  <div className="walk-total">
                    Всего за день:{' '}
                    <strong>
                      {totalWalkHours > 0
                        ? `${totalWalkHours} ч ${totalWalkRest} мин`
                        : `${totalWalkMinutes} мин`}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            <div className="field">
              <label className="label">
                📝 Заметка
              </label>

              <textarea
                className="input textarea"
                rows="4"
                placeholder="Что-нибудь важное за сегодня"
                value={note}
                onChange={(event) =>
                  setNote(
                    event.target.value
                  )
                }
              />
            </div>

            <div className="sheet-actions">
              <button
                className="cancel-button"
                onClick={() =>
                  setDailyFormOpen(false)
                }
              >
                Отмена
              </button>

              <button
                className="save-button"
                onClick={saveDailyRecord}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="history-page">
          <div className="history-sheet">
            <div className="history-header">
            </div>

            <div className="history-tabs">
              <button
                className={
                  historyMode === 'today'
                    ? 'active'
                    : ''
                }
                onClick={() => {
                  setSelectedDate(today)
                  setHistoryMode('today')
                }}
              >
                Сегодня
              </button>

              <button
                className={
                  historyMode ===
                  'yesterday'
                    ? 'active'
                    : ''
                }
                onClick={() => {
                  const yesterday =
                    new Date()
                  yesterday.setDate(
                    yesterday.getDate() - 1
                  )
                  setSelectedDate(
                    getDateString(yesterday)
                  )
                  setHistoryMode(
                    'yesterday'
                  )
                }}
              >
                Вчера
              </button>

              <button
                className={
                  historyMode === '7days'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setHistoryMode('7days')
                }
              >
                7 дней
              </button>

              <button
                className={
                  historyMode ===
                  'calendar'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setHistoryMode(
                    'calendar'
                  )
                }
              >
                Календарь
              </button>
            </div>

            {historyLoading ? (
              <div className="history-loading">
                Загружаем историю…
              </div>
            ) : historyMode ===
              '7days' ? (
              renderSevenDays()
            ) : historyMode ===
              'calendar' ? (
              <>
                <div className="calendar-header">
                  <button
                    onClick={
                      previousMonth
                    }
                  >
                    ‹
                  </button>

                  <strong>
                    {monthName}
                  </strong>

                  <button
                    onClick={nextMonth}
                  >
                    ›
                  </button>
                </div>

                {rangeStart && !rangeEnd && (
                  <div className="range-hint">
                    Выберите конец периода
                  </div>
                )}

                {rangeStart && rangeEnd && (
                  <div className="range-bar">
                    <span>
                      Период:{' '}
                      {formatShortDate(rangeStart)}{' '}
                      —{' '}
                      {formatShortDate(rangeEnd)}
                    </span>

                    <button
                      onClick={clearRange}
                    >
                      Сбросить
                    </button>
                  </div>
                )}

                <div className="calendar-weekdays">
                  <span>Пн</span>
                  <span>Вт</span>
                  <span>Ср</span>
                  <span>Чт</span>
                  <span>Пт</span>
                  <span>Сб</span>
                  <span>Вс</span>
                </div>

                <div className="calendar-grid">
                  {calendarDays.map(
                    (date, index) =>
                      date ? (
                        <button
                          key={date}
                          className={
                            'calendar-day ' +
                            (date ===
                              selectedDate &&
                            !rangeEnd
                              ? 'selected'
                              : '') +
                            (date === today
                              ? 'today'
                              : '') +
                            (rangeStart &&
                            rangeEnd &&
                            date >= rangeStart &&
                            date <= rangeEnd
                              ? 'range '
                              : '') +
                            (date === rangeStart &&
                            rangeEnd
                              ? 'range-start'
                              : '') +
                            (date === rangeEnd
                              ? 'range-end'
                              : '')
                          }
                          onClick={() =>
                            selectCalendarDate(
                              date
                            )
                          }
                        >
                          {Number(
                            date.slice(8)
                          )}
                        </button>
                      ) : (
                        <span
                          key={
                            'empty-' +
                            index
                          }
                        />
                      )
                  )}
                </div>

                {historyData &&
                  (rangeEnd
                    ? historyData.dates !==
                      undefined
                    : historyData.date ===
                      selectedDate) && (
                    <div className="calendar-result">
                      {rangeEnd
                        ? renderRange()
                        : renderHistorySingleDay()}
                    </div>
                  )}
              </>
            ) : (
              renderHistorySingleDay()
            )}
          </div>
        </div>
      )}
    </main>
  )
}

export default App