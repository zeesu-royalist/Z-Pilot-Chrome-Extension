import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateRoomPin,
  getTopicName,
  getSessionUserId,
  friendChatManager,
} from '../services/instant-chat.js';
import { StorageService } from '../services/storage.js';

describe('InstantChat Service (PtoP 4-Digit & Group 3-Digit)', () => {
  beforeEach(async () => {
    await StorageService.clearAllFriendChat();
  });

  it('generates a valid 4-digit numeric room PIN for PtoP', () => {
    for (let i = 0; i < 20; i++) {
      const pin = generateRoomPin('ptop');
      expect(pin).toHaveLength(4);
      expect(/^\d{4}$/.test(pin)).toBe(true);
      const num = Number(pin);
      expect(num).toBeGreaterThanOrEqual(1000);
      expect(num).toBeLessThanOrEqual(9999);
    }
  });

  it('generates a valid 3-digit numeric room PIN for Group Chat', () => {
    for (let i = 0; i < 20; i++) {
      const pin = generateRoomPin('group');
      expect(pin).toHaveLength(3);
      expect(/^\d{3}$/.test(pin)).toBe(true);
      const num = Number(pin);
      expect(num).toBeGreaterThanOrEqual(100);
      expect(num).toBeLessThanOrEqual(999);
    }
  });

  it('correctly formats namespaced room topic name for PtoP (4-digit)', () => {
    expect(getTopicName('4829')).toBe('zpilot_chat_v2_4829');
    expect(getTopicName(' 1234 ', 'ptop')).toBe('zpilot_chat_v2_1234');
  });

  it('correctly formats namespaced room topic name for Group (3-digit)', () => {
    expect(getTopicName('482', 'group')).toBe('zpilot_chat_grp_482');
    expect(getTopicName('789')).toBe('zpilot_chat_grp_789'); // auto-detected 3-digit
  });

  it('provides a persistent session user id for the active browser context', () => {
    const uid1 = getSessionUserId();
    const uid2 = getSessionUserId();
    expect(uid1).toBeTruthy();
    expect(uid1.startsWith('user_')).toBe(true);
    expect(uid1).toBe(uid2);
  });

  it('persists and restores friend chat messages in browser storage', async () => {
    const pin = '4829';
    await StorageService.appendFriendChatMessage(pin, {
      id: 'msg_1',
      text: 'Hello from friend!',
      senderId: 'user_xyz',
      senderName: 'Rahul',
      timestamp: Date.now(),
      isMine: false,
      delivered: true,
      roomPin: pin,
      mode: 'ptop',
    });

    const messages = await StorageService.getFriendChatMessages(pin);
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('Hello from friend!');
    expect(messages[0].senderName).toBe('Rahul');

    // Messages persist until explicitly deleted
    await StorageService.clearFriendChatMessages(pin);
    const cleared = await StorageService.getFriendChatMessages(pin);
    expect(cleared).toHaveLength(0);
  });

  it('persists active session state across window reloads', async () => {
    await StorageService.saveFriendChatSession({
      activePin: '782',
      mode: 'group',
      displayName: 'Zeesu',
      connectedAt: Date.now(),
    });

    const session = await StorageService.getFriendChatSession();
    expect(session).not.toBeNull();
    expect(session?.activePin).toBe('782');
    expect(session?.mode).toBe('group');
    expect(session?.displayName).toBe('Zeesu');
  });

  it('friendChatManager exposes reactive state and panel visibility', () => {
    friendChatManager.setPanelOpen(true);
    expect(friendChatManager.getState().isPanelOpen).toBe(true);
    expect(friendChatManager.getState().unreadCount).toBe(0);

    friendChatManager.setPanelOpen(false);
    expect(friendChatManager.getState().isPanelOpen).toBe(false);
  });

  it('manages multiple saved rooms and lists them', async () => {
    await StorageService.appendFriendChatMessage('1234', {
      id: 'm1',
      text: 'PtoP message',
      senderId: 'u1',
      senderName: 'Alice',
      timestamp: Date.now(),
      isMine: true,
      roomPin: '1234',
      mode: 'ptop',
    });

    await StorageService.appendFriendChatMessage('567', {
      id: 'm2',
      text: 'Group message',
      senderId: 'u2',
      senderName: 'Bob',
      timestamp: Date.now(),
      isMine: false,
      roomPin: '567',
      mode: 'group',
    });

    const rooms = await StorageService.getSavedRoomsList();
    expect(rooms).toContain('1234');
    expect(rooms).toContain('567');

    const ptopMsgs = await StorageService.getFriendChatMessages('1234');
    expect(ptopMsgs).toHaveLength(1);
    expect(ptopMsgs[0].text).toBe('PtoP message');

    const grpMsgs = await StorageService.getFriendChatMessages('567');
    expect(grpMsgs).toHaveLength(1);
    expect(grpMsgs[0].text).toBe('Group message');

    // Delete one room
    await StorageService.clearFriendChatMessages('1234');
    const updatedRooms = await StorageService.getSavedRoomsList();
    expect(updatedRooms).not.toContain('1234');
    expect(updatedRooms).toContain('567');
  });

  it('deduplicates identical message IDs automatically', async () => {
    const pin = '9999';
    const msg = {
      id: 'dup_msg_1',
      text: 'Repeat text',
      senderId: 'u1',
      senderName: 'Tester',
      timestamp: Date.now(),
      isMine: true,
      roomPin: pin,
      mode: 'ptop' as const,
    };

    await StorageService.appendFriendChatMessage(pin, msg);
    await StorageService.appendFriendChatMessage(pin, msg);

    const stored = await StorageService.getFriendChatMessages(pin);
    expect(stored).toHaveLength(1);
  });

  it('wipes all saved rooms and session when clearAllFriendChat is called', async () => {
    await StorageService.saveFriendChatSession({
      activePin: '1111',
      mode: 'ptop',
      displayName: 'User',
      connectedAt: Date.now(),
    });
    await StorageService.appendFriendChatMessage('1111', {
      id: 'm1',
      text: 'hello',
      senderId: 'u1',
      senderName: 'User',
      timestamp: Date.now(),
      isMine: true,
      roomPin: '1111',
      mode: 'ptop',
    });
    await StorageService.appendFriendChatMessage('222', {
      id: 'm2',
      text: 'group msg',
      senderId: 'u2',
      senderName: 'Other',
      timestamp: Date.now(),
      isMine: false,
      roomPin: '222',
      mode: 'group',
    });

    expect(await StorageService.getSavedRoomsList()).toHaveLength(2);

    await StorageService.clearAllFriendChat();

    expect(await StorageService.getSavedRoomsList()).toHaveLength(0);
    expect(await StorageService.getFriendChatSession()).toBeNull();
    expect(await StorageService.getFriendChatMessages('1111')).toHaveLength(0);
    expect(await StorageService.getFriendChatMessages('222')).toHaveLength(0);
  });

  it('updates display name reactively across manager', () => {
    friendChatManager.updateDisplayName('SuperTester');
    expect(friendChatManager.getState().displayName).toBe('SuperTester');
  });
});
