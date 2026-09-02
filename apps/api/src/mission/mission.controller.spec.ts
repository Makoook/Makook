import { MissionController } from './mission.controller.js';

describe('MissionController', () => {
  const missionService = {
    create: vi.fn(),
    listForCustomer: vi.fn(),
    listAvailable: vi.fn(),
    getById: vi.fn(),
    publish: vi.fn(),
    accept: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    reassign: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a mission for the authenticated user', async () => {
    const controller = new MissionController(
      missionService as any,
    );

    missionService.create.mockResolvedValue({
      id: 'mission-1',
    });

    await expect(
      controller.create(
        {
          user: {
            userId: 'customer-1',
          },
        } as any,
        {} as any,
      ),
    ).resolves.toEqual({
      id: 'mission-1',
    });

    expect(
      missionService.create,
    ).toHaveBeenCalledWith(
      'customer-1',
    );
  });
});
