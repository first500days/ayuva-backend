import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMedicationDto } from './create-medication.dto';
import { UpdateMedicationDto } from './update-medication.dto';

const base = { name: 'Metformin', dosage: '500 mg', frequency: 'Twice daily' };

async function timeErrors(
  cls: typeof CreateMedicationDto | typeof UpdateMedicationDto,
  times: unknown,
) {
  const errors = await validate(
    plainToInstance(cls, { ...base, scheduleTimes: times }),
  );
  return errors.filter((e) => e.property === 'scheduleTimes');
}

describe('medication dose times', () => {
  it('accepts 24-hour HH:mm times and an empty list (as needed)', async () => {
    expect(
      await timeErrors(CreateMedicationDto, [
        '08:00',
        '14:00',
        '21:30',
        '00:00',
        '23:59',
      ]),
    ).toHaveLength(0);
    expect(await timeErrors(CreateMedicationDto, [])).toHaveLength(0);
  });

  it('rejects times the reminder scheduler cannot turn into a daily cron', async () => {
    for (const bad of ['25:00', '8am', '8:00', '08:60', '0800', '']) {
      expect(await timeErrors(CreateMedicationDto, [bad])).toHaveLength(1);
    }
  });

  it('checks times when a medicine is edited too', async () => {
    expect(await timeErrors(UpdateMedicationDto, ['24:00'])).toHaveLength(1);
    expect(await timeErrors(UpdateMedicationDto, ['07:30'])).toHaveLength(0);
  });
});
