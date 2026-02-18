import { describe, expect, it } from 'bun:test';
import { UrlHelper } from './url.helper.js';

describe('UrlHelper', () => {
  const helper = new UrlHelper();

  describe('buildUrl', () => {
    it('builds a simple URL from a string base', () => {
      const url = helper.buildUrl({
        base: 'https://example.com',
      });
      expect(url.href).toBe('https://example.com/');
    });

    it('builds a URL from a URL base', () => {
      const base = new URL('https://example.com');
      const url = helper.buildUrl({ base });
      expect(url.href).toBe('https://example.com/');
    });

    it('appends a path to the base', () => {
      const url = helper.buildUrl({
        base: 'https://example.com',
        path: '/api/users',
      });
      expect(url.pathname).toBe('/api/users');
    });

    it('appends path without leading slash', () => {
      const url = helper.buildUrl({
        base: 'https://example.com',
        path: 'api/users',
      });
      expect(url.pathname).toBe('/api/users');
    });

    it('adds query parameters', () => {
      const url = helper.buildUrl({
        base: 'https://example.com/api',
        queryParams: { page: 1, limit: 10, active: true },
      });
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.get('active')).toBe('true');
    });

    it('skips undefined query parameters', () => {
      const url = helper.buildUrl({
        base: 'https://example.com/api',
        queryParams: { page: 1, filter: undefined },
      });
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.has('filter')).toBe(false);
    });

    it('replaces path parameters in the base URL', () => {
      const url = helper.buildUrl({
        base: 'https://example.com/api/{version}',
        pathParams: { version: 'v2' },
      });
      expect(url.pathname).toBe('/api/v2');
    });

    it('replaces path parameters in the path', () => {
      const url = helper.buildUrl({
        base: 'https://example.com',
        path: '/users/{userId}/posts/{postId}',
        pathParams: { userId: 42, postId: 7 },
      });
      expect(url.pathname).toBe('/users/42/posts/7');
    });

    it('combines path params, path, and query params', () => {
      const url = helper.buildUrl({
        base: 'https://api.example.com/{version}',
        path: '/users/{id}',
        pathParams: { version: 'v1', id: 123 },
        queryParams: { fields: 'name' },
      });
      expect(url.pathname).toBe('/v1/users/123');
      expect(url.searchParams.get('fields')).toBe('name');
    });
  });

  describe('interpolate', () => {
    it('replaces placeholders with values', () => {
      const result = helper.interpolate(
        '/api/{version}/users/{id}',
        { version: 'v1', id: 42 },
      );
      expect(result).toBe('/api/v1/users/42');
    });

    it('returns template unchanged when no params', () => {
      const result = helper.interpolate('/api/users');
      expect(result).toBe('/api/users');
    });

    it('is case-insensitive for placeholders', () => {
      const result = helper.interpolate('/api/{Version}', {
        version: 'v1',
      });
      expect(result).toBe('/api/v1');
    });

    it('leaves unmatched placeholders as-is', () => {
      const result = helper.interpolate(
        '/api/{version}/{unknown}',
        { version: 'v1' },
      );
      expect(result).toBe('/api/v1/{unknown}');
    });

    it('skips undefined param values', () => {
      const result = helper.interpolate('/api/{version}', {
        version: undefined,
      });
      expect(result).toBe('/api/{version}');
    });

    it('handles boolean param values', () => {
      const result = helper.interpolate('/api/{active}', {
        active: true,
      });
      expect(result).toBe('/api/true');
    });
  });
});
