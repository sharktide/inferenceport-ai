Buckets availability
====================

``ipx bucket`` currently provides public availability and pricing discovery.
Buckets is not available yet; creation, file transfers, usage accounting and
S3 credential issuance have not shipped.

.. code-block:: console

   ipx bucket status
   ipx bucket pricing
   ipx --json bucket pricing
   ipx -O acme bucket status
   ipx --personal bucket status

The commands use the configured API base URL and preserve existing global
options. Catalog discovery does not send an authentication token or organization
selector and cannot create billable resources. The response currently reports
``not_available`` with no active rates, tiers or offers. A server without the
new endpoints may return ``404``. An empty catalog is not a zero-cost offer.

Future bucket operations must derive ownership from the authenticated account
or authorized organization context, matching existing ``-O/--org`` and
``--personal`` behavior. See :doc:`../api/buckets` for the planned S3 endpoint,
authentication, pricing contract and compatibility restrictions.
